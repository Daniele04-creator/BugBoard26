# BugBoard26

Progetto realizzato per l'esame di **Ingegneria del Software** presso l'Università degli Studi di Napoli Federico II. **Voto: 30/30.**

**Autore:** Daniele De Blasio.

BugBoard26 è un'applicazione web per gestire le segnalazioni di un progetto software: bug, richieste di chiarimento, problemi di documentazione e nuove funzionalità. Il team può assegnare il lavoro, seguirne lo stato, discutere le soluzioni e consultare lo storico delle attività.

Il backend è sviluppato in **Java 21 e Spring Boot**, il frontend in **React e TypeScript**, con **PostgreSQL** per la persistenza e **Docker Compose** per l'avvio dei servizi.

## Cosa chiedeva la traccia

La traccia richiedeva una piattaforma collaborativa per la gestione delle issue, con queste 18 funzionalità:

1. Autenticazione con email e password, amministratore iniziale e creazione degli account da parte degli amministratori.
2. Creazione di issue con titolo, descrizione e tipo: `question`, `bug`, `documentation` o `feature`. Priorità e immagine allegata erano funzionalità gradite; lo stato iniziale doveva essere `todo`.
3. Una vista riepilogativa con filtri e ordinamento.
4. Assegnazione delle segnalazioni da parte di un amministratore, notifica al responsabile e vista del lavoro assegnato.
5. Commenti per messaggi, aggiornamenti e richieste di chiarimento.
6. Cambio di stato da parte dell'assegnatario e notifica all'autore quando una segnalazione viene risolta.
7. Dashboard amministrativa con issue aperte, carico per utente e tempi medi di risoluzione.
8. Esportazione dell'elenco in un formato condivisibile; nel progetto è stato scelto **CSV**.
9. Permessi distinti: gli utenti normali modificano le issue assegnate, gli amministratori hanno accesso completo.
10. Etichette personalizzabili da associare alle segnalazioni.
11. Ricerca per parole chiave.
12. Cronologia delle modifiche con autore e data.
13. Archiviazione riservata agli amministratori e consultazione in una pagina dedicata.
14. Suggerimenti di assegnazione basati sul carico di lavoro corrente.
15. Account esterni in sola lettura per consultare issue e commenti.
16. Gestione dei duplicati, con chiusura della segnalazione duplicata.
17. Report mensili con metriche aggregate e per singolo utente.
18. Scadenze opzionali impostate dagli amministratori.

La traccia richiedeva inoltre frontend e backend indipendenti, comunicazione tramite API di rete, dati persistenti gestiti centralmente dal backend, linguaggi orientati agli oggetti e progettazione UML con strumenti CASE. Il progetto adotta API REST e diagrammi PlantUML. Docker era una scelta auspicata: qui viene usato per avviare l'intero sistema.

## Schermate dell'applicazione

Le schermate mostrano l'applicazione con dati dimostrativi e persone fittizie.

### Bacheca delle issue

Vista per stato, ricerca, filtri, priorità e accesso alle issue assegnate.

![Bacheca delle issue organizzate per stato](https://github.com/Daniele04-creator/BugBoard26/releases/download/documentation/bacheca.png)

### Dettaglio di una issue

Descrizione, responsabile, scadenza, etichette, discussione e accesso alla cronologia.

![Dettaglio di una issue con proprietà e commenti](https://github.com/Daniele04-creator/BugBoard26/releases/download/documentation/dettaglio-issue.png)

### Assegnazione del lavoro

Scelta del responsabile con indicazione del carico e suggerimento del candidato.

![Dialogo di assegnazione con carico di lavoro e suggerimento](https://github.com/Daniele04-creator/BugBoard26/releases/download/documentation/assegnazione.png)

## Documentazione tecnica

[**Scarica la documentazione tecnica in PDF**](https://github.com/Daniele04-creator/BugBoard26/releases/download/documentation/BugBoard26-documentazione.pdf)

Il documento descrive requisiti e casi d'uso, architettura del sistema, design del software, persistenza, diagrammi UML e verifiche di qualità.

Il PDF e le schermate sono allegati alla [release della documentazione](https://github.com/Daniele04-creator/BugBoard26/releases/tag/documentation), esterni alle cartelle del codice.

## Provare il progetto

### Prerequisiti

- **Git** per clonare il repository.
- **Docker Engine con Docker Compose**, oppure Docker Desktop avviato con container Linux.
- **PowerShell 7**, con il comando `pwsh` disponibile.

Per questo avvio non occorre installare Java, Node.js o PostgreSQL sul computer: sono inclusi nelle immagini Docker.

### Avvio

Esegui questi comandi in PowerShell:

```powershell
git clone https://github.com/Daniele04-creator/BugBoard26.git
cd BugBoard26
Copy-Item deploy/.env.example deploy/.env

$configuration = Get-Content -Raw deploy/.env
foreach ($key in @('DATABASE_PASSWORD', 'MIGRATION_PASSWORD', 'POSTGRES_ADMIN_PASSWORD', 'AUTH_IP_HASH_SECRET')) {
    $bytes = [byte[]]::new(32)
    [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $secret = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
    $configuration = [regex]::Replace($configuration, "(?m)^$key=\s*$", "$key=$secret")
}
[IO.File]::WriteAllText((Join-Path (Get-Location) 'deploy/.env'), $configuration)

docker compose --env-file deploy/.env -f deploy/compose.yaml up --build -d --wait --wait-timeout 180
```

Questi comandi generano i segreti locali, compilano le immagini e avviano database, backend e frontend. Esegui la copia e la generazione dei segreti soltanto alla prima configurazione. Al primo avvio sono necessari accesso a Internet e il tempo per scaricare le dipendenze. Quando i servizi risultano pronti, apri **[http://localhost:8088](http://localhost:8088)**.

### Primo accesso

Su un database nuovo viene creato questo amministratore dimostrativo:

| Campo | Valore |
| --- | --- |
| Email | `admin@bugboard.local` |
| Password temporanea | `BugBoard26-ChangeMe!` |

Il primo accesso richiede il cambio della password. In seguito usa la password scelta: i riavvii non ripristinano le credenziali iniziali. L'amministratore può creare altri utenti dalla sezione **Team**.

### Arrestare e riavviare

Dalla cartella principale:

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml down
```

Il database resta nel volume Docker. Per riavviare:

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --wait --wait-timeout 180
```

Le porte predefinite sono `8088` per l'interfaccia, `8080` per le API e `55433` per PostgreSQL. Se una porta è occupata, modifica rispettivamente `FRONTEND_PORT`, `SERVER_PORT` o `DB_HOST_PORT` in `deploy/.env`. Se cambi la porta frontend, aggiorna anche `PUBLIC_BASE_URL` e l'origine corrispondente in `CORS_ALLOWED_ORIGINS`. Questo file contiene segreti locali ed è escluso da Git.

## Test automatici

Il repository include i test del backend. GitHub Actions esegue la stessa suite, con analisi statica e verifica della copertura. Per eseguirla localmente servono **JDK 21** e Docker operativo.

Dalla cartella principale, su Windows:

```powershell
cd backend
.\mvnw.cmd -B -ntp verify
cd ..
```

Su Linux e macOS usa `./mvnw` al posto di `.\mvnw.cmd`.
