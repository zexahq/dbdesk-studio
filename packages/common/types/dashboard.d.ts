/**
 * Dashboard types for persistence
 * These types are used for storing dashboards locally and in cloud storage
 */
export type WidgetType = 'kpi' | 'table' | 'barChart' | 'lineChart' | 'pieChart' | 'scatterChart' | 'savedQueries' | 'notes';
export interface WidgetPosition {
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
}
export interface KPIWidgetSettings {
    valueField: string;
    labelField?: string;
    prefix?: string;
    suffix?: string;
    formatType?: 'number' | 'currency' | 'percentage';
    decimals?: number;
    compareField?: string;
    compareLabel?: string;
}
export interface TableWidgetSettings {
    columns?: string[];
    pageSize?: number;
    sortable?: boolean;
    filterable?: boolean;
}
export interface ChartWidgetSettings {
    xAxisField: string;
    yAxisField: string;
    colorField?: string;
    showLegend?: boolean;
    showGrid?: boolean;
    colors?: string[];
    orientation?: 'vertical' | 'horizontal';
}
export interface PieChartWidgetSettings {
    labelField: string;
    showLegend?: boolean;
    showTable?: boolean;
    colors?: string[];
}
export interface SavedQueriesWidgetSettings {
    content: string;
}
export interface NotesWidgetSettings {
    content: string;
}
export interface ScatterWidgetSettings {
    xAxisField: string;
    yAxisField: string;
    labelField?: string;
    showGrid?: boolean;
    colors?: string[];
}
export type WidgetSettings = KPIWidgetSettings | TableWidgetSettings | ChartWidgetSettings | PieChartWidgetSettings | ScatterWidgetSettings | SavedQueriesWidgetSettings | NotesWidgetSettings;
export interface Widget<T extends WidgetSettings = WidgetSettings> {
    id: string;
    type: WidgetType;
    title: string;
    queryId: string | null;
    customQuery?: string;
    position: WidgetPosition;
    settings: T;
}
export interface DashboardLayout {
    columns: number;
    rowHeight: number;
    margin?: [number, number];
    containerPadding?: [number, number];
}
export interface DashboardConfig {
    dashboardId: string;
    connectionId: string;
    userId?: string;
    name: string;
    description?: string;
    layout: DashboardLayout;
    widgets: Widget[];
    createdAt: Date;
    updatedAt: Date;
}
export interface DashboardStorage {
    [connectionId: string]: DashboardConfig[];
}
export type CloudStorageProvider = 'github-gist' | 's3' | 'azure-blob' | 'gcs';
export interface CloudStorageConfig {
    provider: CloudStorageProvider;
    enabled: boolean;
    githubToken?: string;
    gistId?: string;
    s3Bucket?: string;
    s3Region?: string;
    s3AccessKeyId?: string;
    s3SecretAccessKey?: string;
    s3Key?: string;
    azureConnectionString?: string;
    azureContainer?: string;
    azureBlobName?: string;
    gcsBucket?: string;
    gcsKeyFile?: string;
    gcsObjectName?: string;
}
export interface DashboardSyncStatus {
    lastSyncedAt?: Date;
    syncError?: string;
    isSyncing: boolean;
}
export interface DashboardExport {
    version: string;
    exportedAt: string;
    dashboards: DashboardConfig[];
}
