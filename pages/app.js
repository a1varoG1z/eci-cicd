const STORAGE_KEY = "pw-evidencias-actions-config";

const ownerEl = document.getElementById("owner");
const repoEl = document.getElementById("repo");
const refEl = document.getElementById("ref");
const tokenEl = document.getElementById("token");
const actionSelectEl = document.getElementById("actionSelect");
const tagEl = document.getElementById("tag");
const workflowFileEl = document.getElementById("workflowFile");
const workflowInputsEl = document.getElementById("workflowInputs");
const runBtn = document.getElementById("runBtn");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");
const runInfoEl = document.getElementById("runInfo");
const artifactsEl = document.getElementById("artifacts");
const artifactHtmlBlobUrls = new Map();

const ACTIONS = {
  playwright: {
    workflowFile: "playwright-manual.yml",
    defaultTag: "@regression",
    forceDefaultTag: false
  },
  accessibility: {
    workflowFile: "playwright-accessibility-manual.yml",
    defaultTag: "@accesibility",
    forceDefaultTag: true
  },
  "prueba-eci": {
    workflowFile: "playwright-manual.yml",
    defaultTag: "@prueba-eci",
    forceDefaultTag: true
  }
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function parseInputsJson(rawValue) {
  if (!rawValue.trim()) return {};

  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error("El campo 'Inputs del workflow' debe ser JSON valido.");
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Los inputs deben ser un objeto JSON con pares clave/valor.");
  }

  return parsed;
}

const browserEl = document.getElementById("browser");
const headlessEl = document.getElementById("headless");

function readConfig() {
  const action = actionSelectEl.value || "playwright";
  const actionConfig = ACTIONS[action] || ACTIONS.playwright;

  const inputs = parseInputsJson(workflowInputsEl.value);
  inputs.tags = actionConfig.forceDefaultTag ? actionConfig.defaultTag : tagEl.value;
  inputs.browser = (browserEl?.value || "chromium").toLowerCase();
  inputs.headless = headlessEl?.value || "true";

  return {
    action,
    owner: ownerEl.value,
    repo: repoEl.value,
    ref: refEl.value,
    token: tokenEl.value,
    workflowFile: workflowFileEl.value || actionConfig.workflowFile,
    workflowInputsRaw: workflowInputsEl.value,
    inputs,
    tag: actionConfig.forceDefaultTag ? actionConfig.defaultTag : tagEl.value
  };
}

function saveLocalConfig() {
  try {
    const cfg = readConfig();
    const toPersist = {
      owner: cfg.owner,
      repo: cfg.repo,
      ref: cfg.ref,
      action: cfg.action,
      tag: cfg.tag,
      workflowFile: cfg.workflowFile,
      workflowInputsRaw: cfg.workflowInputsRaw
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    setStatus("Configuracion guardada en localStorage (sin PAT).");
  } catch (err) {
    setStatus(err.message || String(err), true);
  }
}

function loadLocalConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const cfg = JSON.parse(saved);
    ownerEl.value = cfg.owner || ownerEl.value;
    repoEl.value = cfg.repo || repoEl.value;
    refEl.value = cfg.ref || refEl.value;
    actionSelectEl.value = cfg.action || "playwright";
    tagEl.value = cfg.tag || "@regression";
    workflowFileEl.value = cfg.workflowFile || workflowFileEl.value;
    workflowInputsEl.value = cfg.workflowInputsRaw || "{}";

    applyActionPreset(actionSelectEl.value);
  } catch {
    setStatus("No se pudo cargar la configuracion local.", true);
  }
}

function applyActionPreset(action) {
  const actionConfig = ACTIONS[action] || ACTIONS.playwright;
  const knownWorkflowFiles = Object.values(ACTIONS).map((item) => item.workflowFile);

  if (actionConfig.forceDefaultTag) {
    tagEl.value = actionConfig.defaultTag;
    tagEl.disabled = true;
  } else {
    tagEl.disabled = false;
    if (!tagEl.value.trim()) {
      tagEl.value = actionConfig.defaultTag;
    }
  }

  if (!workflowFileEl.value.trim() || knownWorkflowFiles.includes(workflowFileEl.value.trim())) {
    workflowFileEl.value = actionConfig.workflowFile;
  }
}

function guessRepoFromLocation() {
  const host = window.location.hostname;
  const pathParts = window.location.pathname.split("/").filter(Boolean);

  if (host.endsWith("github.io") && host !== "github.io") {
    const owner = host.split(".")[0];
    if (!ownerEl.value) ownerEl.value = owner;
    if (pathParts.length > 0 && !repoEl.value) repoEl.value = pathParts[0];
  }
}

async function ghFetch(url, token, options = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function renderRunInfo(run, owner, repo) {
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${run.id}`;
  runInfoEl.innerHTML = `
    <p><strong>Run ID:</strong> ${run.id}</p>
    <p><strong>Status:</strong> ${run.status}</p>
    <p><strong>Conclusion:</strong> ${run.conclusion || "-"}</p>
    <p class="links"><a href="${runUrl}" target="_blank" rel="noreferrer">Abrir ejecucion en GitHub</a></p>
  `;
}

async function dispatchWorkflow(cfg) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${cfg.workflowFile}/dispatches`;
  await ghFetch(url, cfg.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: cfg.ref,
      inputs: cfg.inputs
    })
  });
}

async function getCurrentUser(token) {
  return ghFetch("https://api.github.com/user", token);
}

async function findRun(cfg, userLogin, notBeforeIso) {
  const q = new URLSearchParams({
    event: "workflow_dispatch",
    branch: cfg.ref,
    per_page: "30"
  });

  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/workflows/${cfg.workflowFile}/runs?${q.toString()}`;
  const data = await ghFetch(url, cfg.token);

  const notBefore = new Date(notBeforeIso).getTime();
  const run = (data.workflow_runs || []).find((r) => {
    const created = new Date(r.created_at).getTime();
    return created >= notBefore && r.actor && r.actor.login === userLogin;
  });

  return run || null;
}

async function waitForRun(cfg, userLogin, notBeforeIso) {
  for (let i = 0; i < 100; i++) {
    const run = await findRun(cfg, userLogin, notBeforeIso);
    if (run) return run;

    setStatus(`Buscando ejecucion... intento ${i + 1}/100`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error("No se encontro la ejecucion lanzada recientemente.");
}

async function getRun(cfg, runId) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/runs/${runId}`;
  return ghFetch(url, cfg.token);
}

async function waitForCompletion(cfg, runId) {
  for (let i = 0; i < 180; i++) {
    const run = await getRun(cfg, runId);
    renderRunInfo(run, cfg.owner, cfg.repo);

    if (run.status === "completed") {
      return run;
    }

    setStatus(`Workflow en ejecucion (${run.status})...`);
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  throw new Error("Timeout esperando a que termine el workflow.");
}

async function listArtifacts(cfg, runId) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/actions/runs/${runId}/artifacts`;
  return ghFetch(url, cfg.token);
}

async function fetchArtifactBlob(cfg, artifact) {
  const response = await fetch(artifact.archive_download_url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Error descargando artefacto (${response.status}): ${txt}`);
  }

  return response.blob();
}

async function downloadArtifact(cfg, artifact) {
  setStatus(`Descargando artefacto ${artifact.name}...`);
  const blob = await fetchArtifactBlob(cfg, artifact);
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = `${artifact.name}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);

  setStatus(`Artefacto ${artifact.name} descargado.`);
}

function revokeArtifactHtmlUrls(artifactId) {
  const currentUrls = artifactHtmlBlobUrls.get(artifactId) || [];
  currentUrls.forEach((url) => URL.revokeObjectURL(url));
  artifactHtmlBlobUrls.delete(artifactId);
}

async function extractHtmlFilesFromArtifact(cfg, artifact) {
  if (!window.JSZip) {
    throw new Error("JSZip no esta cargado. Recarga la pagina e intentalo de nuevo.");
  }

  const blob = await fetchArtifactBlob(cfg, artifact);
  const zip = await window.JSZip.loadAsync(blob);
  const htmlEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && /\.html?$/i.test(entry.name)
  );

  const files = [];
  for (const entry of htmlEntries) {
    const fileBlob = await entry.async("blob");
    const fileUrl = URL.createObjectURL(fileBlob);
    files.push({ name: entry.name, url: fileUrl });
  }

  return files;
}

function renderHtmlLinks(containerEl, artifact, htmlFiles) {
  revokeArtifactHtmlUrls(artifact.id);

  if (!htmlFiles.length) {
    containerEl.innerHTML = "<small>No se encontraron archivos HTML en este artefacto.</small>";
    return;
  }

  artifactHtmlBlobUrls.set(
    artifact.id,
    htmlFiles.map((file) => file.url)
  );

  const links = htmlFiles
    .map(
      (file) =>
        `<a href="${file.url}" target="_blank" rel="noopener noreferrer">${file.name}</a>`
    )
    .join("<br/>");

  containerEl.innerHTML = `<small><strong>HTML detectados:</strong><br/>${links}</small>`;
}

function renderArtifacts(cfg, runId, artifacts) {
  if (!artifacts.length) {
    artifactsEl.innerHTML = "<p>La ejecucion no genero artefactos.</p>";
    return;
  }

  artifactsEl.innerHTML = "";
  artifacts.forEach((artifact) => {
    const row = document.createElement("div");
    row.className = "artifact-item";

    const left = document.createElement("div");
    left.innerHTML = `<strong>${artifact.name}</strong><br/><small>${artifact.size_in_bytes} bytes</small>`;

    const right = document.createElement("div");

    const btn = document.createElement("button");
    btn.textContent = "Descargar ZIP";
    btn.className = "secondary";
    btn.onclick = () => downloadArtifact(cfg, artifact).catch((err) => setStatus(err.message, true));

    const htmlBtn = document.createElement("button");
    htmlBtn.textContent = "Ver HTMLs";
    htmlBtn.className = "secondary";
    htmlBtn.style.marginLeft = "10px";

    const runLink = document.createElement("a");
    runLink.href = `https://github.com/${cfg.owner}/${cfg.repo}/actions/runs/${runId}`;
    runLink.target = "_blank";
    runLink.rel = "noreferrer";
    runLink.textContent = "Ver run";
    runLink.style.marginLeft = "10px";

    const htmlLinks = document.createElement("div");
    htmlLinks.style.marginTop = "10px";

    htmlBtn.onclick = async () => {
      try {
        htmlBtn.disabled = true;
        setStatus(`Buscando HTMLs en ${artifact.name}...`);
        const htmlFiles = await extractHtmlFilesFromArtifact(cfg, artifact);
        renderHtmlLinks(htmlLinks, artifact, htmlFiles);
        setStatus(`HTMLs procesados para ${artifact.name}.`);
      } catch (err) {
        setStatus(err.message || String(err), true);
      } finally {
        htmlBtn.disabled = false;
      }
    };

    right.appendChild(btn);
    right.appendChild(htmlBtn);
    right.appendChild(runLink);

    row.appendChild(left);
    row.appendChild(right);
    artifactsEl.appendChild(row);
    artifactsEl.appendChild(htmlLinks);
  });
}

function validate(cfg) {
  if (!cfg.owner || !cfg.repo || !cfg.ref) {
    throw new Error("Owner, Repository y Ref son obligatorios.");
  }
  if (!cfg.token) {
    throw new Error("Debes indicar un PAT de GitHub.");
  }
  if (!cfg.workflowFile) {
    throw new Error("Debes indicar el workflow file (.yml/.yaml).");
  }
  if (!cfg.tag) {
    throw new Error("Debes indicar el tag para la ejecucion.");
  }
}

async function runFlow() {
  const cfg = readConfig();
  validate(cfg);

  runBtn.disabled = true;
  artifactsEl.innerHTML = "<p>Esperando resultado...</p>";

  try {
    setStatus("Validando token...");
    const user = await getCurrentUser(cfg.token);

    const now = new Date();
    const notBefore = new Date(now.getTime() - 120000).toISOString();

    setStatus("Lanzando workflow...");
    await dispatchWorkflow(cfg);

    setStatus("Workflow lanzado. Buscando run asociado...");
    const run = await waitForRun(cfg, user.login, notBefore);
    renderRunInfo(run, cfg.owner, cfg.repo);

    const completedRun = await waitForCompletion(cfg, run.id);
    setStatus(`Workflow terminado con resultado: ${completedRun.conclusion || "unknown"}`);

    const artifactPayload = await listArtifacts(cfg, run.id);
    renderArtifacts(cfg, run.id, artifactPayload.artifacts || []);
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    runBtn.disabled = false;
  }
}

saveBtn.addEventListener("click", saveLocalConfig);
runBtn.addEventListener("click", () => {
  runFlow();
});
actionSelectEl.addEventListener("change", () => {
  applyActionPreset(actionSelectEl.value);
});

guessRepoFromLocation();
loadLocalConfig();
applyActionPreset(actionSelectEl.value);
