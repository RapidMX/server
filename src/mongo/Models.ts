////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
////////////////////////////////////////////////////////////////////////////////

// The following re-exports needed model classes so that they are properly picked up by
// the ClassLoader (and ObjectFactory) during server startup
export {
    AttachmentMongo,
    CalendarEventMongo,
    CalendarShareLinkMongo,
    ContactListMongo,
    ContactMongo,
    DeviceSyncStateMongo,
    FolderMongo,
    IngestQueueEntryMongo,
    MailboxMongo,
    MessageMongo,
    NoteMongo,
    QuarantineEntryMongo,
    ScanResultMongo,
    SearchIndexStateMongo,
    TaskMongo,
} from "@rapidmx/restapi/mongo";
