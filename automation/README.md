# Dall'estrazione FIR alle grafiche Instagram

Il workflow GitHub è programmato il **giovedì alle 15:00, fuso Europe/Rome**. Gestisce ora solare e legale e pubblica CSV più manifest in un unico commit. La finestra resta giovedì-mercoledì, per includere il weekend e le eventuali gare nei giorni vicini. GitHub può ritardare l'avvio: le 15:00 sono l'orario programmato.

Sul computer dell'utente il progetto è in `C:\Users\lo99\Documents\Grafiche-Rugby`. L'attività Windows **Grafiche Rugby - Sincronizzazione GitHub** controlla la pubblicazione ogni 10 minuti e all'accesso dell'utente. Il computer deve essere acceso, connesso e l'utente deve aver eseguito l'accesso; quando torna disponibile recupera la pubblicazione corrente. Non viene impostato un timer che svegli il PC. L'estrazione cloud continua anche se il PC è spento.

## Risultati locali

- `Input/<dal>_<al>/designazioni_<hash>.csv`: copia esatta dell'estrazione scaricata.
- `Input/<dal>_<al>/estrazione.json`: periodo e metadati della fonte.
- `Output/AUTO_<dal>_<al>/PNG/`: PNG singoli RGB da **1080 × 1080 pixel**.
- `Output/AUTO_<dal>_<al>/*.zip`: solo i PNG singoli, senza font o altri materiali.
- `Output/AUTO_<dal>_<al>/problemi.log`: problemi della specifica esportazione.
- **`Log/DA_RISOLVERE.txt`**: riepilogo aggiornato delle risorse o dei dati da sistemare.
- `Log/automazione.log`: cronologia di download, generazione ed errori, con rotazione.
- `Log/ultimo_controllo.json`: ultimo controllo, anche quando è in attesa della nuova estrazione.
- `Automazione/stato.json`: impronta dei dati/risorse per evitare duplicati.

Esempi di segnalazioni:

```text
[BASE_MANCANTE_O_AMBIGUA] Manca grafica con scritta Assistente per FILIPPO MARCHI. Base richiesta: MARCHI FILIPPO_Assistente.png.
[BASE_MANCANTE_O_AMBIGUA] Manca grafica con scritta Assistente per CESARE SEGNATELLI. Base richiesta: SEGNATELLI CESARE_Assistente.png.
[LOGO_MANCANTE_O_AMBIGUO] Manca logo/abbinamento squadra ...
```

Una base da arbitro non viene usata per un assistente. Non vengono inventati foto, loghi, orari o impianti. Ogni designazione viene controllata separatamente: quelle valide vengono generate anche se altre hanno problemi. Il rapporto include tutti i loghi mancanti della stessa partita anche quando manca la base.

Per rimediare, aggiungere la base corretta in `Grafiche-Base`, il logo in `Loghi`, oppure l'alias in `Generatore/configurazione.json`. Al successivo controllo la modifica alle risorse provoca una nuova esportazione completa, senza sovrascrivere quella precedente; le versioni successive hanno suffissi `_02`, `_03`, ecc. Le precedenti grafiche rimangono disponibili. Se il file remoto è vecchio o il suo hash non coincide, non viene usato per generare nuove grafiche.

Il font è quello configurato nel generatore locale: Flama Condensed Trial Medium. La trial può non contenere lettere accentate: le relative designazioni vengono indicate nel log e richiedono il font completo; i caratteri non vengono eliminati e non viene usato un font sostitutivo.

## Installazione su questo PC

Il repository è clonato in `Grafiche-Rugby\scraper`. Le basi, i loghi, il font e il generatore devono già trovarsi nelle cartelle locali indicate sopra. Python 3.10+ è necessario.

```powershell
cd C:\Users\lo99\Documents\Grafiche-Rugby\scraper
python -m pip install -r .\automation\requirements.txt
powershell -NoProfile -ExecutionPolicy Bypass -File .\automation\install_task.ps1
```

La registrazione usa l'utente corrente, permessi normali e accesso interattivo, senza memorizzare password. Per i download dalla repository pubblica non serve alcun token. Lo script di installazione può essere rieseguito per aggiornare la stessa attività.

## Avvio manuale

Sul PC è disponibile `Grafiche-Rugby\Generatore\Aggiorna_da_GitHub.cmd`. Oppure:

```powershell
python .\automation\sync_graphics.py
python .\automation\sync_graphics.py --verifica
python .\automation\sync_graphics.py --force
```

`--verifica` controlla le immagini senza esportare né cambiare lo stato di deduplicazione. `--force` crea una nuova versione anche se dati e risorse non sono cambiati. Per un'altra posizione usare `--root "D:\Grafiche-Rugby"`.

Per avviare una nuova estrazione cloud, usare il workflow **Weekly FIR officials scrape** nella scheda Actions. Il solo avvio del programma locale scarica l'ultima estrazione già pubblicata e non interroga FIR.

Per disattivare il controllo locale:

```powershell
Disable-ScheduledTask -TaskName "Grafiche Rugby - Sincronizzazione GitHub"
```

## Verifiche

```powershell
npm test
npx tsc --noEmit
python -m unittest discover -s automation -p "test_*.py" -v
```
