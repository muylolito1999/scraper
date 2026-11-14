import csv
from datetime import date
import hashlib
import io
import json
import logging
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from PIL import Image
import sync_graphics as sync

HEADERS = {"surname": "surname", "name": "name", "role": "role", "team1 vs team2": "match",
           "category": "category", "date": "date", "time": "time", "location": "location"}


def row(surname="ROSSI", name="MARIO", role="Arbitro", match="HOME vs AWAY"):
    return dict(surname=surname, name=name, role=role, match=match, category="Serie B",
                date="21/11/2026", time="14:30", location="Campo Test", _row=2)


def publication(rows):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(["Surname", "Name", "Role", "Team1 vs Team2", "Category", "Date", "Time", "Location"])
    for r in rows:
        writer.writerow([r[k] for k in HEADERS.values()])
    data = stream.getvalue().encode()
    return dict(version=1, file="output/2026-11-19.txt", **{"from": "2026-11-19"},
                to="2026-11-25", season="2026/2027", records=len(rows), warnings=[],
                sha256=hashlib.sha256(data).hexdigest(), extractedAt="2026-11-19T14:02:00Z"), data


class FakeCatalog:
    def __init__(self, root, config):
        self.root = root

    def base(self, r):
        path = self.root / "Grafiche-Base" / f"{r['surname']} {r['name']}_{r['role']}.png"
        if not path.is_file():
            raise ValueError("Base assente")
        return path

    def logo(self, team, category):
        path = self.root / "Loghi" / (team + ".png")
        if not path.is_file():
            raise ValueError("Logo assente")
        return path


def fake_generator():
    def prepare(rows, catalog, config):
        r = rows[0]
        return [SimpleNamespace(filename=f"{r['surname']} {r['name']}_{r['role']}.png",
            base=catalog.base(r), logos=[catalog.logo(team, r['category']) for team in r['match'].split(" vs ")])]

    return SimpleNamespace(HEADERS=HEADERS, REQUIRED=set(HEADERS.values()), norm=lambda s: s.lower(),
        Catalog=FakeCatalog, select_font=lambda *args: (Path("flama.otf"), False),
        ImageFont=SimpleNamespace(truetype=lambda *args: SimpleNamespace(getname=lambda: ("Flama Condensed", "Medium"))),
        prepare=prepare, render=lambda *args: (Image.new("RGB", (1080, 1080), "green"), []),
        make_contact_sheet=lambda pngs, destination: Image.new("RGB", (10, 10)).save(destination))


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for folder in ["Generatore/fonts", "Grafiche-Base", "Loghi"]:
            (self.root / folder).mkdir(parents=True)
        (self.root / "Generatore/configurazione.json").write_text("{}")
        (self.root / "Generatore/genera_grafiche.py").write_text("# test adapter\n")
        (self.root / "Grafiche-Base/ROSSI MARIO_Arbitro.png").write_bytes(b"base")
        (self.root / "Grafiche-Base/SEGNATELLI CESARE_Arbitro.png").write_bytes(b"base")
        for team in ["HOME", "AWAY"]:
            (self.root / "Loghi" / (team + ".png")).write_bytes(b"logo")
        self.generator = fake_generator()
        self.logger = logging.getLogger("test-rugby")
        self.logger.addHandler(logging.NullHandler())
        self.patch = patch.object(sync, "load_generator", return_value=self.generator)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_manifest_stale_unsafe_and_bad_hash(self):
        meta, data = publication([row()])
        sync.validate_manifest(meta, date(2026, 11, 21))
        with self.assertRaises(sync.AwaitingPublication):
            sync.validate_manifest(meta, date(2026, 11, 26))
        with self.assertRaises(ValueError):
            sync.validate_manifest({**meta, "file": "../private.txt"}, date(2026, 11, 21))
        with patch.object(sync, "get_bytes", side_effect=[json.dumps(meta).encode(), data + b"bad"]):
            with self.assertRaisesRegex(ValueError, "hash"):
                sync.fetch_publication(sync.REPOSITORY, "master", date(2026, 11, 21))

    def test_missing_base_and_both_logos_are_all_reported(self):
        catalog = FakeCatalog(self.root, {})
        assignment, errors = sync.prepare_one(row("MARCHI", "FILIPPO", "Assistente", "UNKNOWN vs MISSING"), self.generator, catalog, {})
        self.assertIsNone(assignment)
        self.assertEqual([e["codice"] for e in errors], ["BASE_MANCANTE_O_AMBIGUA", "LOGO_MANCANTE_O_AMBIGUO", "LOGO_MANCANTE_O_AMBIGUO"])
        self.assertIn("Assistente per FILIPPO MARCHI", errors[0]["messaggio"])

    def test_existing_referee_base_does_not_replace_assistant(self):
        assignment, errors = sync.prepare_one(row("SEGNATELLI", "CESARE", "Assistente"), self.generator, FakeCatalog(self.root, {}), {})
        self.assertIsNone(assignment)
        self.assertIn("SEGNATELLI CESARE_Assistente.png", errors[0]["messaggio"])

    def test_partial_batch_generates_valid_png_and_lists_every_missing_base(self):
        rows = [row(), row("MARCHI", "FILIPPO", "Assistente"), row("SEGNATELLI", "CESARE", "Assistente")]
        meta, data = publication(rows)
        report = sync.generate_batch(self.root, meta, data, self.logger)
        self.assertEqual((report["generate"], report["saltate"], report["stato"]), (1, 2, "PARZIALE"))
        with Image.open(Path(report["output"]) / report["designazioni"][0]["file"]) as png:
            self.assertEqual(png.size, (1080, 1080))
        with zipfile.ZipFile(report["zip"]) as archive:
            self.assertEqual(len(archive.namelist()), 1)
        log = (self.root / "Log/DA_RISOLVERE.txt").read_text(encoding="utf-8")
        self.assertIn("FILIPPO MARCHI", log)
        self.assertIn("CESARE SEGNATELLI", log)

    def test_unchanged_inputs_do_not_duplicate_outputs_but_new_base_retries(self):
        meta, data = publication([row(), row("MARCHI", "FILIPPO", "Assistente")])
        first = sync.synchronize(self.root, meta, data, self.logger)
        second = sync.synchronize(self.root, meta, data, self.logger)
        self.assertTrue(second["invariato"])
        self.assertEqual(first["output"], second["output"])
        (self.root / "Grafiche-Base/MARCHI FILIPPO_Assistente.png").write_bytes(b"new base")
        third = sync.synchronize(self.root, meta, data, self.logger)
        self.assertEqual((third["generate"], third["saltate"]), (2, 0))
        self.assertNotEqual(first["output"], third["output"])
        self.assertTrue(Path(first["output"]).is_dir())

    def test_empty_cells_do_not_block_other_assignments(self):
        broken = row("VERDI", "LUCA")
        broken["time"] = ""
        meta, data = publication([row(), broken])
        report = sync.generate_batch(self.root, meta, data, self.logger)
        self.assertEqual((report["generate"], report["saltate"]), (1, 1))
        self.assertEqual(report["problemi"][0]["codice"], "DATI_INCOMPLETI")

    def test_successful_empty_week_and_verification_without_export(self):
        meta, data = publication([])
        report = sync.generate_batch(self.root, meta, data, self.logger, verify=True)
        self.assertEqual(report["stato"], "COMPLETO")
        self.assertFalse((self.root / "Output").exists())
        report = sync.generate_batch(self.root, meta, data, self.logger)
        self.assertEqual(report["generate"], 0)
        self.assertIsNone(report["zip"])

    def test_source_count_mismatch_is_fatal(self):
        meta, data = publication([row()])
        with self.assertRaisesRegex(ValueError, "Conteggio"):
            sync.generate_batch(self.root, {**meta, "records": 2}, data, self.logger)


if __name__ == "__main__":
    unittest.main()
