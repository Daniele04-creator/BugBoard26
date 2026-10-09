package it.unina.bugboard26.shared.application;

import it.unina.bugboard26.issues.domain.IssueStatus;
import it.unina.bugboard26.issues.domain.IssueType;
import it.unina.bugboard26.issues.domain.Priority;
import it.unina.bugboard26.users.domain.UserRole;

import java.util.List;

final class DemoDataset {
    private DemoDataset() {
    }

    static final List<Person> PEOPLE = List.of(
        new Person("Chiara Romano", "chiara.romano@bugboard.demo.example.test", UserRole.MEMBER),
        new Person("Marco Esposito", "marco.esposito@bugboard.demo.example.test", UserRole.MEMBER),
        new Person("Giulia Ferrara", "giulia.ferrara@bugboard.demo.example.test", UserRole.MEMBER),
        new Person("Luca Moretti", "luca.moretti@bugboard.demo.example.test", UserRole.MEMBER),
        new Person("Sara Conti", "sara.conti@bugboard.demo.example.test", UserRole.MEMBER),
        new Person("Paolo Rinaldi", "paolo.rinaldi@bugboard.demo.example.test", UserRole.VIEWER)
    );

    static final List<Tag> TAGS = List.of(
        new Tag("Accesso", "blue"),
        new Tag("Interfaccia", "purple"),
        new Tag("Ricerca", "green"),
        new Tag("Notifiche", "amber"),
        new Tag("Report", "gray"),
        new Tag("Prestazioni", "red")
    );

    static final List<Ticket> TICKETS = List.of(
        new Ticket("La sessione scade durante la scrittura di una segnalazione",
            "Dopo una lunga pausa, inviare una segnalazione aperta in precedenza porta alla pagina di accesso e fa perdere il testo. Conservare la bozza e consentire di riprendere dopo l'accesso.",
            IssueType.BUG, Priority.CRITICAL, 0, 1, 0, IssueStatus.TODO, 2,
            "Mi è successo mentre completavo una descrizione articolata: ho perso anche il titolo.",
            "Controllerò la scadenza della sessione e il recupero dei campi prima dell'invio.", false),
        new Ticket("Aggiungere un filtro per le segnalazioni senza assegnatario",
            "Nella lista serve individuare le attività che nessuno ha ancora preso in carico. Il filtro deve combinarsi con stato, priorità e tag e restare visibile quando è attivo.",
            IssueType.FEATURE, Priority.HIGH, 1, -1, 2, IssueStatus.TODO, 7,
            "Questo filtro sarebbe utile durante la distribuzione delle attività del lunedì.",
            "Concordo: includiamo anche il numero di risultati per capire subito il carico da assegnare.", false),
        new Ticket("Il titolo lungo copre il menu delle azioni su schermi piccoli",
            "Aprire il dettaglio di una segnalazione con un titolo di oltre cento caratteri da telefono. Il titolo deve andare a capo senza sovrapporsi al menu e senza creare scorrimento orizzontale.",
            IssueType.BUG, Priority.MEDIUM, 2, 4, 1, IssueStatus.TODO, 6,
            "La sovrapposizione compare soprattutto quando il telefono è in verticale.",
            "Verificherò anche il pulsante per tornare alla lista nello stesso spazio.", false),
        new Ticket("Chiarire quando usare una domanda invece di una segnalazione",
            "Aggiungere nella guida esempi brevi dei tipi disponibili. Spiegare quando una richiesta di chiarimento va classificata come domanda e quando descrive un problema riproducibile.",
            IssueType.DOCUMENTATION, Priority.LOW, 4, -1, 4, IssueStatus.TODO, -1,
            "Nel gruppo stiamo usando categorie diverse per richieste molto simili.",
            "Possiamo partire da tre esempi concreti e renderli disponibili vicino alla scelta del tipo.", false),
        new Ticket("Come vengono conteggiate le attività archiviate nel riepilogo?",
            "Verificare se il riepilogo include le segnalazioni risolte e poi archiviate. Riportare la regola nella guida, distinguendo il totale delle attività dalle sole attività attive.",
            IssueType.QUESTION, Priority.LOW, 3, -1, 4, IssueStatus.TODO, -1,
            "Sto confrontando la lista con il riepilogo e vorrei capire quali elementi rientrano nel totale.",
            "Raccogliamo la regola attuale e un esempio con una segnalazione archiviata.", false),
        new Ticket("Evitare notifiche ripetute quando si salva senza cambiare assegnatario",
            "Aprire una segnalazione già assegnata, modificare solo la descrizione e salvare. La persona assegnata non deve ricevere una nuova notifica di assegnazione se il valore è rimasto invariato.",
            IssueType.BUG, Priority.HIGH, 1, 0, 3, IssueStatus.TODO, 4,
            "Ieri ho ricevuto tre avvisi per la stessa attività dopo correzioni al testo.",
            "Confronteremo il valore precedente e quello salvato prima di creare l'avviso.", false),
        new Ticket("Permettere di copiare un collegamento diretto alla segnalazione",
            "Nel dettaglio aggiungere un'azione per copiare il collegamento della segnalazione. Mostrare una conferma chiara e gestire il caso in cui il browser non consenta l'accesso agli appunti.",
            IssueType.FEATURE, Priority.MEDIUM, 0, 2, 1, IssueStatus.TODO, 10,
            "Quando condivido un'attività in riunione devo recuperare ogni volta l'indirizzo dalla barra.",
            "L'azione può stare nel menu del dettaglio, accanto alle altre operazioni disponibili.", false),
        new Ticket("La ricerca non trova i titoli con apostrofo",
            "Cercare una parola presente in un titolo che contiene un apostrofo, come accesso nell'area personale. La ricerca deve trovare la segnalazione anche con una porzione del titolo.",
            IssueType.BUG, Priority.MEDIUM, 2, -1, 2, IssueStatus.TODO, 8,
            "Ho cercato una parte esatta del titolo, ma la lista è rimasta vuota.",
            "Confronterò il comportamento con apostrofi semplici e tipografici.", false),
        new Ticket("Rendere più evidente la scadenza delle attività di oggi",
            "Nella lista e nel dettaglio distinguere le scadenze di oggi da quelle future. Usare un'etichetta leggibile insieme al colore, mantenendo il formato della data completo.",
            IssueType.FEATURE, Priority.MEDIUM, 4, 3, 1, IssueStatus.TODO, 0,
            "La data è presente, ma durante il controllo quotidiano non si nota subito ciò che scade oggi.",
            "Manteniamo anche un testo esplicito per chi non distingue facilmente i colori.", false),
        new Ticket("Documentare i permessi del ruolo di sola lettura",
            "Descrivere nella guida cosa può consultare una persona con ruolo di sola lettura e quali azioni richiedono un membro o un amministratore. Allineare gli esempi ai pulsanti effettivamente disponibili.",
            IssueType.DOCUMENTATION, Priority.LOW, 3, -1, 0, IssueStatus.TODO, 14,
            "Vorrei condividere la guida con chi entra nel progetto soltanto per seguire gli aggiornamenti.",
            "Inseriamo una tabella breve dei permessi per evitare dubbi al primo accesso.", false),
        new Ticket("Il salvataggio rapido crea due commenti identici",
            "Scrivere un commento e premere due volte il pulsante di invio su una connessione lenta. Deve essere creato un solo commento e il pulsante deve restare disabilitato finché la richiesta è in corso.",
            IssueType.BUG, Priority.CRITICAL, 0, 1, 5, IssueStatus.IN_PROGRESS, 1,
            "Il doppio inserimento rende difficile seguire la discussione quando la connessione è lenta.",
            "Sto controllando la protezione del pulsante e la gestione delle richieste duplicate.", false),
        new Ticket("Mantenere i filtri tornando dal dettaglio alla lista",
            "Impostare stato e tag nella lista, aprire una segnalazione e tornare indietro. Conservare i filtri e la posizione nella lista per proseguire la consultazione senza ripetere la ricerca.",
            IssueType.FEATURE, Priority.HIGH, 2, 4, 2, IssueStatus.IN_PROGRESS, 3,
            "Durante la revisione di più attività devo ricostruire i filtri dopo ogni apertura.",
            "Ho avviato la conservazione dei parametri della lista; resta da verificare il ritorno con il browser.", false),
        new Ticket("Il contatore delle notifiche resta visibile dopo la lettura",
            "Aprire tutte le notifiche non lette e tornare alla pagina principale. Il contatore deve aggiornarsi senza richiedere il ricaricamento della pagina e riflettere soltanto gli avvisi ancora da leggere.",
            IssueType.BUG, Priority.MEDIUM, 1, 0, 3, IssueStatus.IN_PROGRESS, 5,
            "Dopo la lettura vedo ancora il numero precedente fino al successivo aggiornamento della pagina.",
            "La lettura viene registrata; sto allineando il contatore mostrato nell'intestazione.", false),
        new Ticket("Aggiungere una vista delle attività assegnate alla persona collegata",
            "Offrire un accesso rapido alle proprie attività aperte. La vista deve mostrare assegnatario, priorità e scadenza e consentire comunque di passare alla lista completa.",
            IssueType.FEATURE, Priority.HIGH, 4, 2, 1, IssueStatus.IN_PROGRESS, 7,
            "All'inizio della giornata mi serve una lista delle attività che devo seguire personalmente.",
            "Sto collegando il filtro all'utente corrente e verificando il comportamento senza assegnazioni.", false),
        new Ticket("La lista rallenta quando si cambia ordinamento",
            "Con molte segnalazioni, passare dall'ordinamento per data a quello per priorità lascia la lista bloccata per alcuni secondi. Verificare le richieste e mantenere un indicatore di caricamento durante l'aggiornamento.",
            IssueType.BUG, Priority.HIGH, 3, 1, 5, IssueStatus.IN_PROGRESS, 4,
            "Il ritardo si nota dopo aver sfogliato diverse pagine di risultati.",
            "Sto misurando il tempo delle richieste e controllando che il cambio ordine riparta dalla prima pagina.", false),
        new Ticket("Spiegare il ciclo di vita di una segnalazione nella guida",
            "Descrivere i passaggi da attività da fare a in corso e risolta. Includere cosa succede quando una segnalazione viene riaperta e quando è opportuno archiviarla.",
            IssueType.DOCUMENTATION, Priority.LOW, 0, 3, 4, IssueStatus.IN_PROGRESS, 9,
            "Le nuove persone chiedono spesso se risolvere e archiviare siano la stessa operazione.",
            "Ho preparato gli esempi; sto verificando i nomi degli stati nelle schermate.", false),
        new Ticket("Perché una segnalazione risolta compare ancora tra le mie attività?",
            "Chiarire se la vista personale mostra tutte le assegnazioni o soltanto quelle aperte. Confrontare il comportamento con i filtri attivi e aggiungere una spiegazione vicina alla lista.",
            IssueType.QUESTION, Priority.LOW, 2, 4, 2, IssueStatus.IN_PROGRESS, -1,
            "Ho risolto un'attività, ma continuo a vederla quando apro le mie assegnazioni.",
            "Sto controllando i filtri della vista personale prima di indicare la regola nella guida.", false),
        new Ticket("Il cambio di ruolo non aggiorna subito le azioni disponibili",
            "Modificare il ruolo di un membro mentre la sua sessione è attiva. Al successivo aggiornamento dei dati, l'interfaccia deve riflettere i permessi correnti e gestire con chiarezza le operazioni non più consentite.",
            IssueType.BUG, Priority.CRITICAL, 4, 0, 0, IssueStatus.IN_PROGRESS, 2,
            "Dopo il passaggio alla sola lettura restano visibili alcune azioni che poi vengono rifiutate.",
            "Sto verificando il rinnovo dei dati dell'utente e il messaggio restituito quando i permessi cambiano.", false),
        new Ticket("La descrizione perde gli a capo dopo una modifica",
            "Modificare una segnalazione con una descrizione divisa in paragrafi. Dopo il salvataggio e la riapertura, mantenere gli a capo per rendere leggibili i passaggi necessari a riprodurre il problema.",
            IssueType.BUG, Priority.MEDIUM, 1, 2, 1, IssueStatus.RESOLVED, -1,
            "Le istruzioni numerate diventavano un unico blocco dopo il salvataggio.",
            "La descrizione ora conserva i paragrafi; ho verificato anche la riapertura del dettaglio.", false),
        new Ticket("Mostrare un messaggio chiaro quando la ricerca non ha risultati",
            "Quando nessuna segnalazione corrisponde ai filtri, mostrare un messaggio esplicito e un'azione per azzerarli. Evitare una pagina vuota che possa sembrare un errore di caricamento.",
            IssueType.FEATURE, Priority.MEDIUM, 2, 4, 2, IssueStatus.RESOLVED, -1,
            "Con più filtri attivi la lista vuota sembrava una schermata ancora in caricamento.",
            "Il messaggio e l'azione per cancellare i filtri sono disponibili anche su schermi piccoli.", false),
        new Ticket("Correggere il riepilogo delle attività per priorità",
            "Confrontare i totali del riepilogo con la lista filtrata per priorità. Ogni segnalazione deve comparire una sola volta nel conteggio e gli stessi filtri devono produrre totali coerenti.",
            IssueType.BUG, Priority.HIGH, 3, 1, 4, IssueStatus.RESOLVED, -1,
            "Il totale delle attività ad alta priorità era diverso da quello della lista corrispondente.",
            "Ho verificato i conteggi con attività aperte, risolte e archiviate usando gli stessi criteri.", false),
        new Ticket("Aggiungere la data di aggiornamento nel dettaglio",
            "Mostrare quando una segnalazione è stata aggiornata l'ultima volta, accanto alla data di creazione. La data deve cambiare dopo una modifica ai contenuti o allo stato.",
            IssueType.FEATURE, Priority.LOW, 0, 3, 1, IssueStatus.RESOLVED, -1,
            "La data di creazione da sola non permette di capire se l'attività è stata seguita di recente.",
            "La data di aggiornamento è visibile e viene aggiornata dopo le modifiche principali.", false),
        new Ticket("Il messaggio di accesso fallito non è leggibile da telefono",
            "Inserire credenziali non valide da un dispositivo con schermo stretto. Il messaggio deve restare interamente visibile, vicino ai campi, senza spostare il pulsante fuori dallo schermo.",
            IssueType.BUG, Priority.MEDIUM, 4, 0, 0, IssueStatus.RESOLVED, -1,
            "Il testo del messaggio usciva dal riquadro e non riuscivo a leggerne la parte finale.",
            "Il messaggio ora va a capo correttamente ed è stato controllato anche con caratteri ingranditi.", true),
        new Ticket("Aggiornare la guida per la gestione dei tag",
            "Spiegare come associare un tag a una segnalazione e come scegliere nomi utili al gruppo. Includere un esempio di ricerca che combina tag e stato.",
            IssueType.DOCUMENTATION, Priority.LOW, 1, 2, 4, IssueStatus.RESOLVED, -1,
            "La vecchia guida non mostrava il passaggio per selezionare il tag nel modulo.",
            "Gli esempi sono aggiornati e la guida descrive le azioni presenti nell'interfaccia.", true)
    );

    record Person(String fullName, String email, UserRole role) {
    }

    record Tag(String name, String color) {
    }

    record Ticket(String title, String description, IssueType type, Priority priority,
                  int reporter, int assignee, int tag, IssueStatus status, int dueInDays,
                  String discussion, String reply, boolean archived) {
    }
}
