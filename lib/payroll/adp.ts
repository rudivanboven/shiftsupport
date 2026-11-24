import type { PayrollLine, PayrollProvider, PayrollSubmitResult } from "./index";

export type AdpProduct = "workforce_now" | "run" | "vantage";

export interface AdpConfigInput {
  product?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  sslCert?: string | null;
  sslKey?: string | null;
  tokenUrl?: string | null;
  payDataInputUrl?: string | null;
  companyCode?: string | null;
  earningsCode?: string | null;
}

export interface AdpConnectionStatus {
  connected: boolean;
  product: AdpProduct | null;
  companyCode: string | null;
  earningsCode: string;
  hasClientCredentials: boolean;
  hasMtlsCertificate: boolean;
  hasEndpoints: boolean;
  missingRequirements: string[];
}

export interface AdpPreparedEntry {
  associateId: string;
  shiftId: string;
  workerId: string;
  workerName: string | null;
  storeName: string | null;
  shiftDate: string;
  earningsCode: string;
  approvedHours: number;
  hourlyRate: number;
  grossAmount: number;
}

export interface AdpPreparedBatch {
  ready: boolean;
  batchId: string;
  companyCode: string | null;
  totalHours: number;
  totalGrossAmount: number;
  entries: AdpPreparedEntry[];
  unmappedWorkers: { shiftId: string; workerId: string; workerName: string | null }[];
  duplicateShiftIds: string[];
  validationErrors: string[];
}

const VALID_PRODUCTS = new Set<AdpProduct>(["workforce_now", "run", "vantage"]);

export function readAdpEnvConfig(): AdpConfigInput {
  return {
    product: process.env.ADP_PRODUCT ?? null,
    clientId: process.env.ADP_CLIENT_ID ?? null,
    clientSecret: process.env.ADP_CLIENT_SECRET ?? null,
    sslCert: process.env.ADP_SSL_CERT_PEM ?? process.env.ADP_SSL_CERT_PATH ?? null,
    sslKey: process.env.ADP_SSL_KEY_PEM ?? process.env.ADP_SSL_KEY_PATH ?? null,
    tokenUrl: process.env.ADP_TOKEN_URL ?? null,
    payDataInputUrl: process.env.ADP_PAY_DATA_INPUT_URL ?? null,
    companyCode: process.env.ADP_COMPANY_CODE ?? null,
    earningsCode: process.env.ADP_EARNINGS_CODE ?? "REG",
  };
}

/**
 * Inspects the server-side ADP configuration without guessing any endpoints or
 * credentials. Reports every missing item required from the client.
 */
export function inspectAdpConfiguration(
  input: AdpConfigInput = readAdpEnvConfig(),
): AdpConnectionStatus {
  const rawProduct = (input.product ?? "").trim().toLowerCase() as AdpProduct;
  const product = VALID_PRODUCTS.has(rawProduct) ? rawProduct : null;
  const clientId = (input.clientId ?? "").trim();
  const clientSecret = (input.clientSecret ?? "").trim();
  const sslCert = (input.sslCert ?? "").trim();
  const sslKey = (input.sslKey ?? "").trim();
  const tokenUrl = (input.tokenUrl ?? "").trim();
  const payDataInputUrl = (input.payDataInputUrl ?? "").trim();
  const companyCode = (input.companyCode ?? "").trim() || null;
  const earningsCode = (input.earningsCode ?? "").trim() || "REG";

  const missingRequirements: string[] = [];

  if (!product) {
    missingRequirements.push(
      "ADP_PRODUCT (confirm whether the client uses ADP Workforce Now, ADP RUN, or ADP Vantage)",
    );
  }
  if (!clientId || !clientSecret) {
    missingRequirements.push(
      "ADP_CLIENT_ID and ADP_CLIENT_SECRET (OAuth 2.0 credentials issued by ADP Marketplace / Partner team)",
    );
  }
  if (!sslCert || !sslKey) {
    missingRequirements.push(
      "ADP_SSL_CERT_PEM and ADP_SSL_KEY_PEM (Mutual TLS X.509 client certificate and private key required by ADP Security Services)",
    );
  }
  if (!tokenUrl || !payDataInputUrl) {
    missingRequirements.push(
      "ADP_TOKEN_URL and ADP_PAY_DATA_INPUT_URL (provisioned ADP OAuth token endpoint and Pay Data Input API endpoint)",
    );
  }
  if (!companyCode) {
    missingRequirements.push(
      "ADP_COMPANY_CODE (ADP company / pay group code for pay-data batch imports)",
    );
  }

  const hasClientCredentials = Boolean(clientId && clientSecret);
  const hasMtlsCertificate = Boolean(sslCert && sslKey);
  const hasEndpoints = Boolean(tokenUrl && payDataInputUrl);

  return {
    connected:
      Boolean(product) &&
      hasClientCredentials &&
      hasMtlsCertificate &&
      hasEndpoints &&
      Boolean(companyCode),
    product,
    companyCode,
    earningsCode,
    hasClientCredentials,
    hasMtlsCertificate,
    hasEndpoints,
    missingRequirements,
  };
}

/**
 * Validates and prepares approved worker timesheet lines for ADP payroll submission.
 *
 * Ensures:
 *   - only positive approved actual hours are included;
 *   - every worker has a mapped ADP employee/associate ID (`externalEmployeeId`);
 *   - duplicate shift entries in the same batch are rejected.
 */
export function prepareAdpPayrollBatch(
  lines: PayrollLine[],
  options: {
    batchId: string;
    companyCode?: string | null;
    earningsCode?: string | null;
  },
): AdpPreparedBatch {
  const companyCode = (options.companyCode ?? "").trim() || null;
  const earningsCode = (options.earningsCode ?? "").trim() || "REG";

  const entries: AdpPreparedEntry[] = [];
  const unmappedWorkers: { shiftId: string; workerId: string; workerName: string | null }[] = [];
  const seenShiftIds = new Set<string>();
  const duplicateShiftIds: string[] = [];
  const validationErrors: string[] = [];

  if (lines.length === 0) {
    validationErrors.push("No approved payroll lines are ready for submission.");
  }

  for (const line of lines) {
    if (seenShiftIds.has(line.shiftId)) {
      duplicateShiftIds.push(line.shiftId);
      validationErrors.push(`Duplicate shift ${line.shiftId} in payroll batch.`);
      continue;
    }
    seenShiftIds.add(line.shiftId);

    if (!Number.isFinite(line.approvedHours) || line.approvedHours <= 0) {
      validationErrors.push(
        `Shift ${line.shiftId} does not have valid approved hours.`,
      );
      continue;
    }

    if (!Number.isFinite(line.hourlyRate) || line.hourlyRate <= 0) {
      validationErrors.push(
        `Shift ${line.shiftId} does not have a valid hourly rate.`,
      );
      continue;
    }

    const associateId = (line.externalEmployeeId ?? "").trim();
    if (!associateId) {
      unmappedWorkers.push({
        shiftId: line.shiftId,
        workerId: line.workerId,
        workerName: line.workerName,
      });
      continue;
    }

    const grossAmount = Math.round(line.approvedHours * line.hourlyRate * 100) / 100;

    entries.push({
      associateId,
      shiftId: line.shiftId,
      workerId: line.workerId,
      workerName: line.workerName,
      storeName: line.storeName,
      shiftDate: line.shiftDate,
      earningsCode,
      approvedHours: line.approvedHours,
      hourlyRate: line.hourlyRate,
      grossAmount,
    });
  }

  if (unmappedWorkers.length > 0) {
    const names = unmappedWorkers
      .map((w) => w.workerName ?? w.workerId.slice(0, 8))
      .join(", ");
    validationErrors.push(
      `${unmappedWorkers.length} worker${
        unmappedWorkers.length === 1 ? " is" : "s are"
      } missing an ADP employee ID (${names}). Assign their ADP employee ID on their worker profile before submitting to ADP.`,
    );
  }

  const totalHours =
    Math.round(entries.reduce((sum, e) => sum + e.approvedHours, 0) * 100) / 100;
  const totalGrossAmount =
    Math.round(entries.reduce((sum, e) => sum + e.grossAmount, 0) * 100) / 100;

  return {
    ready: validationErrors.length === 0 && entries.length > 0,
    batchId: options.batchId,
    companyCode,
    totalHours,
    totalGrossAmount,
    entries,
    unmappedWorkers,
    duplicateShiftIds,
    validationErrors,
  };
}

export interface AdpProviderOptions extends AdpConfigInput {
  fetchImpl?: typeof fetch;
}

/**
 * ADP Payroll Provider implementation.
 *
 * Never fakes payroll processing: if ADP credentials, mTLS certificates, or
 * API endpoints are not configured, `isConfigured()` returns `false` and
 * `submit()` returns a clear error detailing the missing requirements.
 */
export function createAdpPayrollProvider(
  options: AdpProviderOptions = readAdpEnvConfig(),
): PayrollProvider {
  const fetchFn = options.fetchImpl ?? fetch;

  return {
    id: "adp",
    label: "ADP Payroll API",
    isConfigured() {
      return inspectAdpConfiguration(options).connected;
    },
    async submit(
      lines: PayrollLine[],
      batchId: string,
    ): Promise<PayrollSubmitResult> {
      const status = inspectAdpConfiguration(options);
      if (!status.connected) {
        return {
          ok: false,
          error: `ADP Payroll API is not connected. Missing client configuration: ${status.missingRequirements.join("; ")}.`,
        };
      }

      const prepared = prepareAdpPayrollBatch(lines, {
        batchId,
        companyCode: status.companyCode,
        earningsCode: status.earningsCode,
      });

      if (!prepared.ready) {
        return {
          ok: false,
          error: prepared.validationErrors.join(" "),
        };
      }

      const tokenUrl = (options.tokenUrl ?? "").trim();
      const payDataInputUrl = (options.payDataInputUrl ?? "").trim();
      const clientId = (options.clientId ?? "").trim();
      const clientSecret = (options.clientSecret ?? "").trim();

      try {
        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        const tokenResponse = await fetchFn(tokenUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        });

        let tokenBody: { access_token?: string; error_description?: string; error?: string } = {};
        try {
          tokenBody = (await tokenResponse.json()) as typeof tokenBody;
        } catch {
          // Non-JSON response
        }

        if (!tokenResponse.ok || !tokenBody.access_token) {
          return {
            ok: false,
            error: `ADP OAuth authentication failed (${tokenResponse.status}): ${
              tokenBody.error_description ?? tokenBody.error ?? "could not obtain access token"
            }`,
          };
        }

        const submitResponse = await fetchFn(payDataInputUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenBody.access_token}`,
            "Content-Type": "application/json",
            "Idempotency-Key": batchId,
          },
          body: JSON.stringify({
            payDataInput: {
              batchID: prepared.batchId,
              companyCode: prepared.companyCode,
              payDataEntries: prepared.entries.map((entry) => ({
                associateOID: entry.associateId,
                shiftID: entry.shiftId,
                workDate: entry.shiftDate,
                earningsCode: entry.earningsCode,
                hoursWorked: entry.approvedHours,
                rateValue: entry.hourlyRate,
                grossAmount: entry.grossAmount,
              })),
            },
          }),
        });

        let submitBody: {
          confirmMessage?: { resourceID?: string };
          batchID?: string;
          message?: string;
        } = {};
        try {
          submitBody = (await submitResponse.json()) as typeof submitBody;
        } catch {
          // Non-JSON response
        }

        if (!submitResponse.ok) {
          return {
            ok: false,
            error: `ADP Pay Data submission failed (${submitResponse.status}): ${
              submitBody.message ?? "request rejected by ADP"
            }`,
          };
        }

        const externalRef =
          submitBody.confirmMessage?.resourceID ??
          submitBody.batchID ??
          prepared.batchId;

        return {
          ok: true,
          externalRef,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Network error connecting to ADP";
        return {
          ok: false,
          error: `ADP API request failed: ${message}`,
        };
      }
    },
  };
}
