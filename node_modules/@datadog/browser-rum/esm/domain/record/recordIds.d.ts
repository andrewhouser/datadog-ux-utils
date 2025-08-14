export type RecordIds = ReturnType<typeof initRecordIds>;
export declare function initRecordIds(): {
    getIdForEvent(event: Event): number;
};
