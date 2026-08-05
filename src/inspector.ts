import * as tls from "node:tls";

// Subject/Issuer маркеры Минцифры CA (российский доверенный корневой CA)
const MINTSIFRY_MARKERS = [
  "Russian Trusted Root CA",
  "Russian Trusted Sub CA",
  "Ministry of Digital Development and Communications",
];

export interface InspectionResult {
  isMintsifry: boolean;
  sans: string[];
}

export function inspectUpstream(host: string, port: number): Promise<InspectionResult> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host,
      port,
      servername: host,
      rejectUnauthorized: false, // Мы сами проверяем цепочку ниже
    });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TLS inspection timeout for ${host}`));
    }, 5000);

    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate(true);
      socket.destroy();
      resolve({
        isMintsifry: chainContainsMintsifry(cert),
        sans: extractSANs(cert),
      });
    });

    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function chainContainsMintsifry(cert: tls.DetailedPeerCertificate): boolean {
  let current: tls.PeerCertificate | null = cert;
  const seen = new Set<string>();

  while (current) {
    const fp: string | undefined = (current as tls.DetailedPeerCertificate).fingerprint256;
    if (fp) {
      if (seen.has(fp)) break; // Защита от циклов в цепочке
      seen.add(fp);
    }

    const fields = [
      JSON.stringify(current.issuer ?? {}),
      JSON.stringify(current.subject ?? {}),
    ].join(" ");

    if (MINTSIFRY_MARKERS.some((m) => fields.includes(m))) return true;

    const next: tls.DetailedPeerCertificate | undefined = (current as tls.DetailedPeerCertificate).issuerCertificate;
    current = next && next !== current ? next : null;
  }

  return false;
}

function extractSANs(cert: tls.PeerCertificate): string[] {
  return (cert.subjectaltname ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("DNS:"))
    .map((s) => s.slice(4));
}
