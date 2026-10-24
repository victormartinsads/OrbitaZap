export class AsaasError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = "AsaasError";
    }
}

type AsaasCycle = "MONTHLY" | "YEARLY";

export interface AsaasPayment {
    id: string;
    subscription?: string;
    customer: string;
    value: number;
    status: string;
    billingType: string;
    dueDate: string;
    paymentDate?: string | null;
    clientPaymentDate?: string | null;
    invoiceUrl?: string;
    externalReference?: string | null;
}

function config() {
    const baseUrl = process.env.ASAAS_API_URL || "https://api-sandbox.asaas.com/v3";
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) throw new AsaasError("ASAAS_API_KEY não configurada", 500);
    return { baseUrl, apiKey };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { baseUrl, apiKey } = config();
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "OrbitaZap",
            access_token: apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const message = data?.errors?.map((e: { description: string }) => e.description).join("; ")
            || `Asaas ${method} ${path} falhou (${res.status})`;
        throw new AsaasError(message, res.status);
    }
    return data as T;
}

export function createCustomer(input: {
    name: string;
    email: string;
    cpfCnpj: string;
    mobilePhone?: string;
    externalReference: string;
}) {
    return request<{ id: string }>("POST", "/customers", { ...input, notificationDisabled: false });
}

export function updateCustomer(id: string, input: { cpfCnpj?: string; mobilePhone?: string; name?: string }) {
    return request<{ id: string }>("POST", `/customers/${id}`, input);
}

export function createSubscription(input: {
    customer: string;
    value: number;
    cycle: AsaasCycle;
    nextDueDate: string;
    description: string;
    externalReference: string;
}) {
    return request<{ id: string }>("POST", "/subscriptions", { ...input, billingType: "UNDEFINED" });
}

export function updateSubscription(id: string, input: { value?: number; cycle?: AsaasCycle; description?: string }) {
    return request<{ id: string }>("POST", `/subscriptions/${id}`, { ...input, updatePendingPayments: true });
}

export function cancelSubscription(id: string) {
    return request<{ deleted: boolean }>("DELETE", `/subscriptions/${id}`);
}

export async function listSubscriptionPayments(id: string) {
    const res = await request<{ data: AsaasPayment[] }>("GET", `/subscriptions/${id}/payments`);
    return res.data;
}

export function getPixQrCode(paymentId: string) {
    return request<{ encodedImage: string; payload: string; expirationDate: string }>(
        "GET",
        `/payments/${paymentId}/pixQrCode`
    );
}
