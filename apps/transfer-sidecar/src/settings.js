import fs from "fs";
import os from "os";
import path from "path";

const DIR = path.join(os.homedir(), ".hyh-oss-browser");
const FILE = path.join(DIR, "settings.json");

const DEFAULTS = {
  maxUploadJobCount: 3,
  maxDownloadJobCount: 1,
  connectTimeout: 60000,
  uploadPartSize: 10,
  downloadConcurrecyPartSize: 5,
  uploadAndDownloadRetryTimes: 5,
  listObjectNum: 500,
  allowInsecureTls: false,
};

export function loadSettings() {
  try {
    if (!fs.existsSync(FILE)) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(partial) {
  fs.mkdirSync(DIR, { recursive: true });
  const next = { ...loadSettings(), ...partial };
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}
