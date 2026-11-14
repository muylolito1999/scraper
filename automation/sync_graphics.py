"""Scarica l'ultima estrazione pubblicata e compone le grafiche sul PC locale."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import csv
from datetime import date, datetime
import hashlib
import importlib.util
import io
import json
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")
DEFAULT_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = "muylolito1999/scraper"


class AwaitingPublication(Exception):
    pass


class AlreadyRunning(Exception):
    pass


def save_json(path: Path, value: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def load_generator(root: Path):
    path = root / "Generatore/genera_grafiche.py"
    spec = importlib.util.spec_from_file_location("rugby_local_generator", path)
    if spec is None or spec.loader is None:
        raise ValueError(f"Generatore non trovato: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def get_bytes(url: str, limit: int) -> bytes:
    request = urllib.request.Request(url, headers={
        "User-Agent": "Grafiche-Rugby/1.0", "Cache-Control": "no-cache",
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("File remoto troppo grande; download interrotto.")
    return data


def validate_manifest(meta: dict, today: date):
    if meta.get("version") != 1:
        raise ValueError("Versione del manifest non supportata.")
    if not re.fullmatch(r"output/\d{4}-\d{2}-\d{2}\.txt", str(meta.get("file", ""))):
        raise ValueError("Percorso del CSV remoto non valido.")
    start, end = date.fromisoformat(meta["from"]), date.fromisoformat(meta["to"])
    if not 0 <= (end - start).days <= 7:
        raise ValueError("Intervallo dell'estrazione non valido.")
    if not start <= today <= end:
        raise AwaitingPublication(f"In attesa dell'estrazione corrente: l'ultima copre {start} / {end}.")
    if not re.fullmatch(r"[a-f0-9]{64}", str(meta.get("sha256", ""))):
        raise ValueError("Hash del CSV remoto non valido.")
    if type(meta.get("records")) is not int or meta["records"] < 0:
        raise ValueError("Conteggio delle designazioni non valido.")
    if not isinstance(meta.get("warnings", []), list) or not all(isinstance(x, str) for x in meta.get("warnings", [])):
        raise ValueError("Avvisi dell'estrazione non validi.")
    extracted = datetime.fromisoformat(meta["extractedAt"].replace("Z", "+00:00"))
    if extracted.tzinfo is None:
        raise ValueError("Manca il fuso orario dell'estrazione.")


def fetch_publication(repository: str, branch: str, today: date) -> tuple[dict, bytes]:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Repository non valida.")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", branch):
        raise ValueError("Branch non valido.")
    base = f"https://raw.githubusercontent.com/{repository}/{branch}/"
    cache_bust = f"?rugby={time.time_ns()}"
    try:
        meta = json.loads(get_bytes(base + "output/latest.json" + cache_bust, 131072))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise AwaitingPublication("In attesa della prima pubblicazione output/latest.json su GitHub.") from None
        raise
    validate_manifest(meta, today)
    data = get_bytes(base + meta["file"] + cache_bust, 8 * 1024 * 1024)
    if hashlib.sha256(data).hexdigest() != meta["sha256"]:
        raise ValueError("Il CSV non corrisponde all'hash pubblicato. Verrà ritentato al prossimo controllo.")
    return meta, data


def read_rows(data: bytes, generator) -> list[dict]:
    # Permit empty individual cells here: each bad assignment gets its own log.
    source = csv.reader(io.StringIO(data.decode("utf-8-sig")), strict=True)
    try:
        names = next(source)
    except StopIteration:
        raise ValueError("CSV vuoto, manca l'intestazione.") from None
    header = [generator.HEADERS.get(generator.norm(h), generator.norm(h)) for h in names]
    if not generator.REQUIRED.issubset(header) or len(set(header)) != len(header):
        raise ValueError("Intestazione del CSV non valida o duplicata.")
    rows = []
    for values in source:
        if not values or not any(value.strip() for value in values):
            continue
        row = {key: "" for key in header}
        row.update(zip(header, (v.strip() for v in values)))
        row["_row"] = source.line_num
        if len(values) != len(header):
            row["_parse_error"] = f"Attese {len(header)} colonne, trovate {len(values)}."
        rows.append(row)
    return rows


def resource_signature(root: Path, sha256: str) -> str:
    parts = [sha256, "sync-graphics-v1"]
    files = [Path(__file__), root / "Generatore/genera_grafiche.py", root / "Generatore/configurazione.json"]
    for name in ("Grafiche-Base", "Loghi", "Generatore/fonts"):
        files.extend(p for p in (root / name).rglob("*") if p.is_file())
    for path in sorted(files):
        stat = path.stat()
        parts.append(f"{path}|{stat.st_size}|{stat.st_mtime_ns}")
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def issue(code: str, message: str, row: dict | None = None) -> dict:
    result = {"codice": code, "messaggio": message}
    if row:
        result["designazione"] = {k: v for k, v in row.items() if not k.startswith("_")}
        result["riga"] = row.get("_row")
    return result


def prepare_one(row: dict, generator, catalog, config: dict) -> tuple[object | None, list[dict]]:
    problems = []
    identity = f"{row.get('name', '')} {row.get('surname', '')}".strip()
    role = row.get("role", "")
    empty = sorted(key for key in generator.REQUIRED if not row.get(key))
    if empty or row.get("_parse_error"):
        text = row.get("_parse_error") or "Dati mancanti: " + ", ".join(empty)
        return None, [issue("DATI_INCOMPLETI", f"{identity} ({role}): {text}", row)]
    try:
        catalog.base(row)
    except (ValueError, OSError) as error:
        expected = f"{row['surname']} {row['name']}_{role}.png"
        problems.append(issue("BASE_MANCANTE_O_AMBIGUA",
            f"Manca grafica con scritta {role} per {identity}. Base richiesta: {expected}. {error}", row))
    teams = re.split(r"\s+v(?:s\.?)?\s+", row["match"], flags=re.I)
    if len(teams) != 2 or not all(teams):
        problems.append(issue("PARTITA_NON_VALIDA", f"{identity}: partita non valida: {row['match']}", row))
    else:
        for team in teams:
            try:
                catalog.logo(team, row["category"])
            except (ValueError, OSError) as error:
                problems.append(issue("LOGO_MANCANTE_O_AMBIGUO", f"Manca logo/abbinamento squadra {team} per {identity} ({role}). {error}", row))
    if problems:
        return None, problems
    try:
        return generator.prepare([row], catalog, config)[0], []
    except (ValueError, OSError, KeyError) as error:
        return None, [issue("DESIGNAZIONE_NON_VALIDA", f"{identity} ({role}): {error}", row)]


def write_problem_log(path: Path, report: dict):
    lines = [f"Aggiornamento: {report['eseguito_il']}",
             f"Periodo: {report['dal']} / {report['al']}",
             f"Designazioni: {report['totale']} | Grafiche create: {report['generate']} | Saltate: {report['saltate']}",
             f"Stato: {report['stato']}", ""]
    lines.extend(f"[{p['codice']}] {p['messaggio']}" for p in report["problemi"])
    if not report["problemi"]:
        lines.append("Nessun problema: tutte le grafiche sono state create.")
    lines.extend(["", f"Cartella risultati: {path.parent}", ""])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def generate_batch(root: Path, meta: dict, data: bytes, logger, *, verify: bool = False) -> dict:
    generator = load_generator(root)
    rows = read_rows(data, generator)
    if len(rows) != meta["records"]:
        raise ValueError(f"Conteggio CSV incoerente: manifest {meta['records']}, CSV {len(rows)}.")
    config = json.loads((root / "Generatore/configurazione.json").read_text(encoding="utf-8"))
    catalog = generator.Catalog(root, config)
    problems = [issue("AVVISO_ESTRAZIONE", text) for text in meta.get("warnings", [])]
    font = None
    font_name = None
    try:
        font, _ = generator.select_font(config, None, False)
        font_name = " ".join(generator.ImageFont.truetype(str(font), 48).getname())
    except (ValueError, OSError) as error:
        problems.append(issue("FONT_NON_DISPONIBILE", str(error)))
    output = root / "Output" / f"AUTO_{meta['from']}_{meta['to']}"
    if not verify:
        counter = 2
        original = output
        while output.exists():
            output = original.with_name(f"{original.name}_{counter:02}")
            counter += 1
        (output / "PNG").mkdir(parents=True)
    generated, filenames = [], set()
    for row in rows:
        assignment, errors = prepare_one(row, generator, catalog, config)
        problems.extend(errors)
        if assignment is None or font is None:
            continue
        key = assignment.filename.casefold()
        if key in filenames:
            problems.append(issue("DUPLICATO", f"Designazione duplicata o simultanea: {assignment.filename}", row))
            continue
        filenames.add(key)
        try:
            image, layout = generator.render(assignment, config, font)
            try:
                if not verify:
                    image.save(output / "PNG" / assignment.filename)
            finally:
                image.close()
            generated.append({"file": "PNG/" + assignment.filename,
                "dati_originali": {k: v for k, v in row.items() if not k.startswith("_")},
                "base": str(assignment.base), "loghi": [str(p) for p in assignment.logos], "testi": layout})
            logger.info("Grafica %s: %s", "verificata" if verify else "creata", assignment.filename)
        except (ValueError, OSError) as error:
            problems.append(issue("GRAFICA_NON_GENERABILE", f"{row['name']} {row['surname']} ({row['role']}): {error}", row))
    report = {"stato": "PARZIALE" if problems else "COMPLETO",
        "eseguito_il": datetime.now(ROME).isoformat(), "dal": meta["from"], "al": meta["to"],
        "fonte": meta, "totale": len(rows), "generate": len(generated), "saltate": len(rows) - len(generated),
        "font": str(font) if font else None, "famiglia_font": font_name,
        "designazioni": generated, "problemi": problems, "output": str(output), "zip": None}
    for problem in problems:
        logger.warning("[%s] %s", problem["codice"], problem["messaggio"])
    if verify:
        return report
    pngs = [output / item["file"] for item in generated]
    if pngs:
        archive = output / (output.name + ".zip")
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            for png in pngs:
                bundle.write(png, png.name)
        report["zip"] = str(archive)
        try:
            generator.make_contact_sheet(pngs, output / "ANTEPRIMA.png")
        except (ValueError, OSError) as error:
            # The individual Instagram graphics and their ZIP are already complete.
            problem = issue("ANTEPRIMA_NON_CREATA", str(error))
            report["problemi"].append(problem)
            report["stato"] = "PARZIALE"
            logger.warning("%s", problem["messaggio"])
    save_json(output / "abbinamenti.json", report)
    write_problem_log(output / "problemi.log", report)
    (root / "Log").mkdir(exist_ok=True)
    (root / "Log/DA_RISOLVERE.txt").write_bytes((output / "problemi.log").read_bytes())
    return report


def outputs_intact(state: dict) -> bool:
    try:
        output = Path(state["output"])
        report = json.loads((output / "abbinamenti.json").read_text(encoding="utf-8"))
        return (output / "problemi.log").is_file() and all((output / d["file"]).is_file() for d in report["designazioni"]) and (
            not report.get("zip") or Path(report["zip"]).is_file())
    except (KeyError, ValueError, OSError):
        return False


def synchronize(root: Path, meta: dict, data: bytes, logger, *, force: bool = False, verify: bool = False) -> dict:
    signature = resource_signature(root, meta["sha256"])
    state_path = root / "Automazione/stato.json"
    try:
        previous = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previous = {}
    if not force and not verify and previous.get("firma") == signature and outputs_intact(previous):
        logger.info("Nessuna modifica a designazioni o risorse; grafiche già presenti in %s", previous["output"])
        return {**previous, "invariato": True}
    if not verify:
        inputs = root / "Input" / f"{meta['from']}_{meta['to']}"
        inputs.mkdir(parents=True, exist_ok=True)
        (inputs / f"designazioni_{meta['sha256'][:12]}.csv").write_bytes(data)
        save_json(inputs / "estrazione.json", meta)
    report = generate_batch(root, meta, data, logger, verify=verify)
    state = {"firma": signature, "output": report["output"], "stato": report["stato"],
             "generate": report["generate"], "saltate": report["saltate"], "eseguito_il": report["eseguito_il"]}
    if not verify:
        save_json(state_path, state)
    return state


@contextmanager
def process_lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as handle:
        if handle.tell() == 0:
            handle.write(b"0")
            handle.flush()
        handle.seek(0)
        try:
            if sys.platform == "win32":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise AlreadyRunning("Una sincronizzazione è già in corso.") from None
        try:
            yield
        finally:
            handle.seek(0)
            if sys.platform == "win32":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def configure_logger(root: Path):
    (root / "Log").mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("rugby-automation")
    logger.setLevel(logging.INFO)
    handler = RotatingFileHandler(root / "Log/automazione.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
    if sys.stdout is not None:
        logger.addHandler(logging.StreamHandler(sys.stdout))
    return logger


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--repository", default=REPOSITORY)
    parser.add_argument("--branch", default="master")
    parser.add_argument("--force", action="store_true", help="Rigenera anche quando i dati non cambiano")
    parser.add_argument("--verifica", action="store_true", help="Verifica senza esportare né cambiare stato")
    args = parser.parse_args()
    root = args.root.resolve()
    logger = configure_logger(root)
    status_path = root / "Log/ultimo_controllo.json"
    try:
        with process_lock(root / "Automazione/sync.lock"):
            meta, data = fetch_publication(args.repository, args.branch, datetime.now(ROME).date())
            result = synchronize(root, meta, data, logger, force=args.force, verify=args.verifica)
            save_json(status_path, {**result, "controllato_il": datetime.now(ROME).isoformat()})
            old_error = root / "Log/ERRORE_ULTIMO_AVVIO.txt"
            if old_error.exists():
                old_error.write_text("Ultimo controllo concluso senza errori di sincronizzazione.\nPer le risorse mancanti consultare DA_RISOLVERE.txt.\n", encoding="utf-8")
            logger.info("%s: %s grafiche, %s saltate. %s", result["stato"], result["generate"], result["saltate"], result["output"])
            return 0
    except AwaitingPublication as error:
        logger.info("%s", error)
        save_json(status_path, {"stato": "IN_ATTESA", "messaggio": str(error), "controllato_il": datetime.now(ROME).isoformat()})
        return 0
    except AlreadyRunning as error:
        logger.info("%s", error)
        return 0
    except Exception as error:
        logger.exception("Automazione non completata: %s", error)
        status = {"stato": "ERRORE", "messaggio": str(error), "controllato_il": datetime.now(ROME).isoformat()}
        save_json(status_path, status)
        (root / "Log/ERRORE_ULTIMO_AVVIO.txt").write_text(str(error) + "\nVedi automazione.log per i dettagli.\n", encoding="utf-8")
        return 1


if __name__ == "__main__":
    if sys.stdout is not None:
        sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
