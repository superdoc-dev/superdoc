import dns from "node:dns/promises";
import net from "node:net";

const LOCALHOST_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

export function createValidationError(message) {
  const error = new Error(message);
  error.name = "ValidationError";
  return error;
}

export function createNetworkError(message) {
  const error = new Error(message);
  error.name = "NetworkError";
  return error;
}

export function parseAllowedFileHosts(value = process.env.SLACK_REDLINING_ALLOWED_FILE_HOSTS) {
  if (typeof value !== "string" || !value.trim()) {
    throw createValidationError("SLACK_REDLINING_ALLOWED_FILE_HOSTS must be configured");
  }

  const hosts = value
    .split(",")
    .map((host) => normalizeHostname(host))
    .filter(Boolean);

  if (hosts.length === 0) {
    throw createValidationError("SLACK_REDLINING_ALLOWED_FILE_HOSTS must include at least one hostname");
  }

  for (const host of hosts) {
    if (host.includes("/") || host.includes(":") || host.includes("*")) {
      throw new Error(`Invalid allowed file host: ${host}`);
    }
  }

  return new Set(hosts);
}

export function validateDownloadUrl(fileUrl, options = {}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(fileUrl);
  } catch {
    throw createValidationError("Invalid fileUrl format");
  }

  if (parsedUrl.protocol !== "https:") {
    throw createValidationError("fileUrl must use HTTPS");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw createValidationError("fileUrl must not include credentials");
  }

  const hostname = normalizeHostname(parsedUrl.hostname);
  if (!hostname) {
    throw createValidationError("fileUrl must include a hostname");
  }

  if (isBlockedNetworkHost(hostname)) {
    throw createValidationError("fileUrl host is not allowed");
  }

  const allowedHosts =
    options.allowedHosts instanceof Set ? options.allowedHosts : parseAllowedFileHosts(options.allowedHostsEnv);
  if (!allowedHosts.has(hostname)) {
    throw createValidationError("fileUrl host is not allowed");
  }

  parsedUrl.hostname = hostname;
  parsedUrl.hash = "";
  return parsedUrl;
}

export async function assertDownloadHostnameIsPublic(downloadUrl) {
  let addresses;
  try {
    addresses = await dns.lookup(downloadUrl.hostname, { all: true });
  } catch (error) {
    throw createNetworkError(`Unable to resolve fileUrl host: ${error.message}`);
  }

  if (addresses.length === 0) {
    throw createNetworkError("Unable to resolve fileUrl host");
  }

  for (const { address } of addresses) {
    if (isBlockedNetworkAddress(address)) {
      throw createValidationError("fileUrl host resolves to a blocked network address");
    }
  }
}

export function createPublicHostnameLookup(resolveAddress = dns.lookup) {
  return (hostname, options, callback) => {
    resolveAddress(hostname, options)
      .then((result) => {
        const addresses = Array.isArray(result) ? result : [result];
        for (const { address } of addresses) {
          if (isBlockedNetworkAddress(address)) {
            throw createValidationError("fileUrl host resolves to a blocked network address");
          }
        }

        if (options?.all) {
          callback(null, result);
          return;
        }

        callback(null, result.address, result.family);
      })
      .catch((error) => {
        callback(error);
      });
  };
}

export function isBlockedNetworkHost(hostname) {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname) return true;
  if (LOCALHOST_HOSTNAMES.has(normalizedHostname) || normalizedHostname.endsWith(".localhost")) return true;

  return isBlockedNetworkAddress(normalizedHostname);
}

export function isBlockedNetworkAddress(address) {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) return isBlockedIpv4(address);
  if (ipVersion === 6) return isBlockedIpv6(address);
  return false;
}

function normalizeHostname(hostname) {
  const normalizedHostname = String(hostname ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");

  if (normalizedHostname.startsWith("[") && normalizedHostname.endsWith("]")) {
    return normalizedHostname.slice(1, -1);
  }

  return normalizedHostname;
}

function isBlockedIpv4(address) {
  const octets = address.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) return true;

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isBlockedIpv6(address) {
  const normalizedAddress = address.toLowerCase();
  if (normalizedAddress.startsWith("::ffff:")) {
    const mappedIpv4Address = getMappedIpv4Address(normalizedAddress);
    return mappedIpv4Address ? isBlockedIpv4(mappedIpv4Address) : true;
  }

  return (
    normalizedAddress === "::" ||
    normalizedAddress === "::1" ||
    normalizedAddress.startsWith("fc") ||
    normalizedAddress.startsWith("fd") ||
    isIpv6LinkLocalAddress(normalizedAddress) ||
    normalizedAddress.startsWith("ff")
  );
}

function getMappedIpv4Address(address) {
  const mappedAddress = address.slice("::ffff:".length);
  if (net.isIP(mappedAddress) === 4) return mappedAddress;

  const hextets = mappedAddress.split(":");
  if (hextets.length !== 2) return null;

  const octets = [];
  for (const hextet of hextets) {
    if (!/^[0-9a-f]{1,4}$/.test(hextet)) return null;
    const value = Number.parseInt(hextet, 16);
    octets.push(value >> 8, value & 0xff);
  }

  return octets.join(".");
}

function isIpv6LinkLocalAddress(address) {
  const firstHextet = address.split(":", 1)[0];
  if (!/^[0-9a-f]{1,4}$/.test(firstHextet)) return false;

  const value = Number.parseInt(firstHextet, 16);
  return value >= 0xfe80 && value <= 0xfebf;
}
