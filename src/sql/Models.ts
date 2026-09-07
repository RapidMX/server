////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////

// The following re-exports needed model classes so that they are properly picked up by
// the ClassLoader (and ObjectFactory) during server startup
export {
    AttachmentSQL,
    CalendarEventSQL,
    CalendarShareLinkSQL,
    ContactListSQL,
    ContactSQL,
    DeviceSyncStateSQL,
    FolderSQL,
    IngestQueueEntrySQL,
    MailboxSQL,
    MessageSQL,
    NoteSQL,
    QuarantineEntrySQL,
    ScanResultSQL,
    SearchIndexStateSQL,
    TaskListSQL,
    TaskSQL,
} from "@rapidmx/restapi/sql";
