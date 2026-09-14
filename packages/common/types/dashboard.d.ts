/**
 * Provider-neutral dashboard models shared by the web client and API.
 * Dashboard data is persisted per database connection and may be supplied by
 * a third-party host through the normal Studio API; it contains no secrets.
 */
export type WidgetType = 'kpi' | 'table' | 'barChart' | 'lineChart' | 'pieChart' | 'notes';
export interface WidgetPosition {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface Widget {
    id: string;
    type: WidgetType;
    title: string;
    queryId: string | null;
    customQuery?: string;
    position: WidgetPosition;
    settings: Record<string, unknown>;
}
export interface DashboardConfig {
    dashboardId: string;
    connectionId: string;
    name: string;
    description?: string;
    widgets: Widget[];
    createdAt: Date;
    updatedAt: Date;
}
export interface DashboardExport {
    version: string;
    exportedAt: string;
    dashboards: DashboardConfig[];
}
