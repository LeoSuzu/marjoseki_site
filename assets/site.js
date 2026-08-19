const currentPage = document.body.dataset.page;

const STORAGE_KEY = "marjo-site-content-v3";
// A browser draft older than this is more likely to be a forgotten/stale
// editing session than real in-progress work, so it's discarded in favor of
// the published content rather than silently overwriting newer edits.
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const state = {
  data: null,
  isAdmin: false,
};

const IMAGE_DEFAULTS = {
  imageScale: 100,
  imagePositionX: 50,
  imagePositionY: 50,
};

const IMAGE_SETTING_NAMES = Object.keys(IMAGE_DEFAULTS);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeImageSettings = (value = {}) =>
  IMAGE_SETTING_NAMES.reduce((settings, name) => {
    const raw = Number(value[name]);
    const fallback = IMAGE_DEFAULTS[name];
    const max = name === "imageScale" ? 180 : 100;
    const min = name === "imageScale" ? 80 : 0;
    settings[name] = clamp(Number.isFinite(raw) ? raw : fallback, min, max);
    return settings;
  }, {});

const getImageSettings = (value) => normalizeImageSettings(value);

const applyImageSettings = (image, value) => {
  if (!image) {
    return;
  }

  const settings = getImageSettings(value);
  image.style.setProperty("--image-scale", String(settings.imageScale / 100));
  image.style.setProperty("--image-position-x", `${settings.imagePositionX}%`);
  image.style.setProperty("--image-position-y", `${settings.imagePositionY}%`);
  image.style.objectPosition = `${settings.imagePositionX}% ${settings.imagePositionY}%`;
};

const imageSettingsPathFromImagePath = (path) => path.replace(/\.image$/, "");

const imageSettingFields = () => [
  { name: "imageScale", label: "Kuvan koko", type: "range", min: 80, max: 180, step: 1, unit: "%" },
  {
    name: "imagePositionX",
    label: "Kuvan sijainti vaakasuunnassa",
    type: "range",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
  },
  {
    name: "imagePositionY",
    label: "Kuvan sijainti pystysuunnassa",
    type: "range",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
  },
];

const getByPath = (object, path) => {
  return path.split(".").reduce((current, segment) => {
    if (current == null) {
      return undefined;
    }

    const key = /^\d+$/.test(segment) ? Number(segment) : segment;
    return current[key];
  }, object);
};

const setByPath = (object, path, value) => {
  const parts = path.split(".");
  const last = parts.pop();
  const target = parts.reduce((current, segment) => {
    const key = /^\d+$/.test(segment) ? Number(segment) : segment;
    return current[key];
  }, object);

  const finalKey = /^\d+$/.test(last) ? Number(last) : last;
  target[finalKey] = value;
};

const removeFromList = (object, path, index) => {
  const list = getByPath(object, path);
  if (Array.isArray(list)) {
    list.splice(index, 1);
  }
};

const text = (id, value, meta) => {
  const node = document.getElementById(id);
  if (!node) {
    return;
  }

  node.textContent = value || "";
  if (meta) {
    registerEditable(node, meta);
  }
};

const revealImage = (image) => {
  image.classList.remove("is-loading");
};

const prepareImage = (image, src) => {
  image.classList.add("site-image", "is-loading");
  image.addEventListener("load", () => revealImage(image), { once: true });
  image.addEventListener(
    "error",
    () => {
      image.removeAttribute("src");
      image.classList.remove("is-loading");
      image.classList.add("is-broken");
    },
    { once: true },
  );

  if (src) {
    image.src = src;
  } else {
    image.removeAttribute("src");
    revealImage(image);
  }

  if (image.complete && image.naturalWidth > 0) {
    revealImage(image);
  }
};

const setImage = (id, src, alt, meta) => {
  const node = document.getElementById(id);
  if (!node) {
    return;
  }

  node.alt = alt || "";
  prepareImage(node, src);
  if (meta) {
    applyImageSettings(node, getByPath(state.data, meta.settingsPath || imageSettingsPathFromImagePath(meta.path)));
    registerEditable(node, meta);
  }
};

const registerEditable = (node, meta) => {
  node.classList.add("editable-target");
  node.__editMeta = meta;
  // Editing is keyboard-reachable, not click-only. The tab stop is added
  // eagerly (admin-mode CSS hides the affordance for visitors) and removed
  // again on sign-out by refreshEditableAffordances().
  node.dataset.editLabel = meta.title || "Muokkaa";
};

const SITE_ORIGIN = "https://marjoseki.fi";
const RECENT_EVENT_DAYS = 60;

const absoluteUrl = (path) => {
  if (!path) {
    return undefined;
  }
  return /^https?:\/\//i.test(path) ? path : `${SITE_ORIGIN}/${String(path).replace(/^\/+/, "")}`;
};

// Structured data is generated from site.json at render time rather than
// hardcoded in the HTML, so event dates, book titles and course listings stay
// correct in search results whenever Marjo publishes a content change.
const setStructuredData = (id, data) => {
  const existing = document.getElementById(id);
  if (!data) {
    existing?.remove();
    return;
  }

  const node = existing || document.createElement("script");
  node.type = "application/ld+json";
  node.id = id;
  node.textContent = JSON.stringify(data);
  if (!existing) {
    document.head.append(node);
  }
};

const toIsoDate = (value) => {
  const parsed = parseEventDate(value);
  if (!parsed) {
    return null;
  }
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
};

// Images below the fold are deferred; the hero image is the LCP element on
// every page, so it stays eager and gets fetch priority instead.
const markLazyImage = (image) => {
  image.loading = "lazy";
  image.decoding = "async";
};

const markEagerImage = (image) => {
  if (!image) {
    return;
  }
  image.loading = "eager";
  image.decoding = "async";
  image.setAttribute("fetchpriority", "high");
};

let siteLoadingFallbackTimer = null;

const clearSiteLoadingState = () => {
  if (siteLoadingFallbackTimer) {
    clearTimeout(siteLoadingFallbackTimer);
    siteLoadingFallbackTimer = null;
  }
  document.body.classList.remove("site-loading");
};

const saveToBrowser = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), data: state.data }));
  updateAdminMessage("Tallennettu tähän selaimeen.");
  scheduleDraftSave();
};

let draftSaveTimer = null;

const scheduleDraftSave = () => {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
  }
  draftSaveTimer = setTimeout(saveDraftToServer, 4000);
};

const saveDraftToServer = async () => {
  try {
    const response = await fetch("/api/save-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: state.data.site }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok && !payload.skipped && !payload.unchanged) {
      updateAdminMessage("Luonnos varmuuskopioitu palvelimelle.");
    }
  } catch (error) {
    console.warn("Luonnoksen varmuuskopiointi epäonnistui.", error);
  }
};

const restoreServerDraft = async () => {
  if (!confirm("Tämä korvaa selaimen nykyiset muutokset palvelimelle viimeksi varmuuskopioidulla luonnoksella. Jatka?")) {
    return;
  }
  updateAdminMessage("Haetaan luonnosta palvelimelta…");
  try {
    const response = await fetch("/api/get-draft");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      updateAdminMessage(payload.error || "Palvelimelta ei löytynyt luonnosta.");
      return;
    }
    state.data = { site: payload.site };
    saveToBrowser();
    renderPage();
    updateAdminChrome();
    updateAdminMessage("Luonnos palautettu palvelimelta.");
  } catch (error) {
    updateAdminMessage("Luonnoksen haku epäonnistui. Tarkista verkkoyhteys.");
  }
};

const resetBrowserEdits = async () => {
  localStorage.removeItem(STORAGE_KEY);
  state.data = await loadSite();
  renderPage();
  updateAdminChrome();
};

const publishChanges = async () => {
  updateAdminMessage("Julkaistaan muutoksia…");
  try {
    const response = await fetch("/api/publish-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: state.data.site }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.ok) {
      updateAdminMessage(payload.error || "Julkaisu epäonnistui. Yritä myöhemmin uudelleen.");
      return;
    }

    if (payload.unchanged) {
      updateAdminMessage("Ei uusia muutoksia julkaistavaksi.");
      return;
    }

    updateAdminMessage("Julkaistu! Sivu päivittyy kaikille noin minuutissa.");
  } catch (error) {
    updateAdminMessage("Julkaisu epäonnistui. Tarkista verkkoyhteys ja yritä uudelleen.");
  }
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const resizeImageBlob = (blob, maxDimension = 1600, quality = 0.82) =>
  new Promise((resolve, reject) => {
    createImageBitmap(blob)
      .then((bitmap) => {
        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
        const width = Math.round(bitmap.width * scale) || 1;
        const height = Math.round(bitmap.height * scale) || 1;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("Kuvan pienennys epäonnistui."))),
          "image/jpeg",
          quality,
        );
      })
      .catch(reject);
  });

const uploadImageBlob = async (blob) => {
  const dataUrl = await fileToDataUrl(blob);
  const response = await fetch("/api/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Kuvan lataus epäonnistui.");
  }
  return payload.path;
};

// Handles a freshly picked file and legacy data-URL values (e.g. an older
// localStorage draft) the same way, so both end up as a real uploaded file.
const resolveImageFieldValue = async (file, currentUrlValue) => {
  let sourceBlob = file || null;
  if (!sourceBlob && currentUrlValue && currentUrlValue.startsWith("data:")) {
    sourceBlob = await dataUrlToBlob(currentUrlValue);
  }
  if (!sourceBlob) {
    return currentUrlValue;
  }
  const resized = await resizeImageBlob(sourceBlob);
  return uploadImageBlob(resized);
};

const showModal = ({ title, description, fields, submitLabel, onSubmit, dangerAction }) => {
  closeModal();

  const overlay = document.createElement("div");
  overlay.className = "editor-modal";

  const card = document.createElement("div");
  card.className = "editor-modal__card";

  const heading = document.createElement("h2");
  heading.textContent = title;
  card.append(heading);

  if (description) {
    const copy = document.createElement("p");
    copy.className = "editor-modal__description";
    copy.textContent = description;
    card.append(copy);
  }

  const form = document.createElement("form");
  form.className = "editor-form";
  const refs = {};
  const errorNode = document.createElement("p");
  errorNode.className = "editor-form__error";
  errorNode.hidden = true;

  fields.forEach((field) => {
    const wrap = document.createElement("label");
    wrap.className = "editor-field";

    const label = document.createElement("span");
    label.className = "editor-field__label";
    label.textContent = field.label;
    wrap.append(label);

    if (field.type === "textarea") {
      const input = document.createElement("textarea");
      input.value = field.value || "";
      input.rows = field.rows || 5;
      wrap.append(input);
      refs[field.name] = input;
    } else if (field.type === "checkbox") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(field.value);
      wrap.append(input);
      refs[field.name] = input;
    } else if (field.type === "date") {
      const input = document.createElement("input");
      input.type = "date";
      input.value = field.value || "";
      wrap.append(input);
      refs[field.name] = input;
    } else if (field.type === "select") {
      const input = document.createElement("select");
      field.options.forEach((option) => {
        const node = document.createElement("option");
        node.value = option;
        node.textContent = option;
        node.selected = option === field.value;
        input.append(node);
      });
      wrap.append(input);
      refs[field.name] = input;
    } else if (field.type === "image") {
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.value = field.value || "";
      urlInput.placeholder = "Liitä kuvan osoite tai jätä nykyinen";
      wrap.append(urlInput);

      const upload = document.createElement("input");
      upload.type = "file";
      upload.accept = "image/*";
      wrap.append(upload);

      if (field.value) {
        const preview = document.createElement("img");
        // Same classes real on-page images get, so the crop/scale sliders
        // preview against the exact aspect-ratio and object-fit the image
        // will actually be shown with -- not a generic, unrelated box.
        preview.className = "editor-field__preview site-image";
        preview.src = field.value;
        preview.alt = "Esikatselu";

        // previewFrame mirrors the real destination markup (e.g. the
        // .gallery-item figure or .book-card__image div an image like this
        // actually renders inside), from outermost to innermost, so the
        // preview reuses the site's own CSS instead of duplicating it.
        let mount = wrap;
        (field.previewFrame || []).forEach((layer) => {
          const layerNode = document.createElement(layer.tag || "div");
          layerNode.className = layer.className;
          mount.append(layerNode);
          mount = layerNode;
        });
        mount.append(preview);
      }

      refs[field.name] = { urlInput, upload };
    } else if (field.type === "range") {
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(field.min);
      input.max = String(field.max);
      input.step = String(field.step || 1);
      input.value = String(field.value ?? field.min);

      const output = document.createElement("output");
      output.className = "editor-field__value";
      const updateOutput = () => {
        output.textContent = `${input.value}${field.unit || ""}`;
      };
      input.addEventListener("input", updateOutput);
      updateOutput();
      wrap.append(input, output);
      refs[field.name] = input;
    } else {
      const input = document.createElement("input");
      input.type = field.type === "password" ? "password" : "text";
      input.value = field.value || "";
      if (field.autocomplete) {
        input.autocomplete = field.autocomplete;
      }
      wrap.append(input);
      refs[field.name] = input;
    }

    if (field.help) {
      const help = document.createElement("small");
      help.className = "editor-field__help";
      help.textContent = field.help;
      wrap.append(help);
    }

    form.append(wrap);
  });

  form.append(errorNode);

  const actions = document.createElement("div");
  actions.className = "editor-actions";

  if (dangerAction) {
    const dangerButton = document.createElement("button");
    dangerButton.type = "button";
    dangerButton.className = "button button--danger";
    dangerButton.textContent = dangerAction.label;
    dangerButton.addEventListener("click", () => {
      const proceeded = dangerAction.onClick();
      if (proceeded !== false) {
        closeModal();
      }
    });
    actions.append(dangerButton);
  }

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button button--ghost";
  cancelButton.textContent = "Peruuta";
  cancelButton.addEventListener("click", closeModal);
  actions.append(cancelButton);

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "button";
  submitButton.textContent = submitLabel;
  actions.append(submitButton);

  form.append(actions);
  card.append(form);
  overlay.append(card);
  document.body.append(overlay);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorNode.hidden = true;
    submitButton.disabled = true;
    const originalLabel = submitButton.textContent;

    try {
      const values = {};
      for (const field of fields) {
        if (field.type === "checkbox") {
          values[field.name] = refs[field.name].checked;
        } else if (field.type === "image") {
          const { urlInput, upload } = refs[field.name];
          if (upload.files[0] || urlInput.value.trim().startsWith("data:")) {
            submitButton.textContent = "Ladataan kuvaa…";
          }
          values[field.name] = await resolveImageFieldValue(upload.files[0], urlInput.value.trim());
        } else if (field.type === "range") {
          values[field.name] = Number(refs[field.name].value);
        } else {
          values[field.name] = refs[field.name].value.trim();
        }
      }

      submitButton.textContent = originalLabel;

      const result = await onSubmit(values);
      if (result && result.error) {
        errorNode.textContent = result.error;
        errorNode.hidden = false;
        return;
      }

      if (result !== false) {
        closeModal();
      }
    } catch (error) {
      errorNode.textContent = error.message || "Jokin meni pieleen.";
      errorNode.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });

  const firstField = form.querySelector("input, textarea, select");
  firstField?.focus();
  return { overlay, refs };
};

const closeModal = () => {
  document.querySelector(".editor-modal")?.remove();
};

const updateAdminMessage = (message) => {
  const node = document.querySelector("[data-admin-message]");
  if (node) {
    node.textContent = message;
  }
};

const openTextEditor = (meta) => {
  showModal({
    title: meta.title || "Muokkaa tekstiä",
    description: "Muuta teksti ja tallenna. Sivu päivittyy heti.",
    submitLabel: "Tallenna teksti",
    fields: [
      {
        name: "value",
        label: "Teksti",
        type: "textarea",
        value: getByPath(state.data, meta.path) || "",
        rows: meta.rows || 5,
      },
    ],
    onSubmit: async (values) => {
      setByPath(state.data, meta.path, values.value);
      saveToBrowser();
      renderPage();
    },
  });
};

const setupImageEditorPreview = (modal) => {
  const preview = modal.overlay.querySelector(".editor-field__preview");
  if (!preview) {
    return;
  }

  const syncPreview = () => {
    applyImageSettings(preview, {
      imageScale: modal.refs.imageScale?.value,
      imagePositionX: modal.refs.imagePositionX?.value,
      imagePositionY: modal.refs.imagePositionY?.value,
    });
  };

  IMAGE_SETTING_NAMES.forEach((name) => modal.refs[name]?.addEventListener("input", syncPreview));
  syncPreview();
};

const openImageEditor = (meta) => {
  const settingsPath = meta.settingsPath || imageSettingsPathFromImagePath(meta.path);
  const settings = getImageSettings(getByPath(state.data, settingsPath));
  const modal = showModal({
    title: meta.title || "Muokkaa kuvaa",
    description: "Liitä kuvan osoite tai lataa uusi kuva tältä koneelta.",
    submitLabel: "Tallenna kuva",
    fields: [
      {
        name: "image",
        label: "Kuva",
        type: "image",
        value: getByPath(state.data, meta.path) || "",
        previewFrame: [
          { tag: "div", className: "page-hero__image" },
          { tag: "div", className: "image-frame" },
        ],
      },
      {
        name: "alt",
        label: "Kuvan kuvaus",
        type: "text",
        value: getByPath(state.data, meta.altPath) || "",
      },
      ...imageSettingFields().map((field) => ({ ...field, value: settings[field.name] })),
    ],
    onSubmit: async (values) => {
      setByPath(state.data, meta.path, values.image);
      setByPath(state.data, meta.altPath, values.alt);
      setByPath(state.data, settingsPath, {
        ...getByPath(state.data, settingsPath),
        ...normalizeImageSettings(values),
      });
      saveToBrowser();
      renderPage();
    },
  });
  setupImageEditorPreview(modal);
};

const openObjectEditor = (meta, schema) => {
  const current = getByPath(state.data, meta.path);
  const hasImageSettings = schema.some((field) => IMAGE_SETTING_NAMES.includes(field.name));
  const modal = showModal({
    title: meta.title || "Muokkaa osiota",
    description: meta.description || "Päivitä tiedot ja tallenna ne sivulle.",
    submitLabel: "Tallenna muutokset",
    fields: schema.map((field) => ({
      ...field,
      value: IMAGE_SETTING_NAMES.includes(field.name)
        ? getImageSettings(current)[field.name]
        : current[field.name],
    })),
    dangerAction:
      typeof meta.index === "number" && meta.listPath
        ? {
            label: "Poista kohde",
            onClick: () => {
              if (!confirm("Poistetaanko tämä kortti pysyvästi? Muutos näkyy kaikille vasta kun painat \"Julkaise sivulle\".")) {
                return false;
              }
              removeFromList(state.data, meta.listPath, meta.index);
              saveToBrowser();
              renderPage();
            },
          }
        : null,
    onSubmit: async (values) => {
      if (typeof meta.validate === "function") {
        const error = meta.validate(values);
        if (error) {
          return { error };
        }
      }
      const nextValues = hasImageSettings
        ? { ...values, ...normalizeImageSettings(values) }
        : values;
      setByPath(state.data, meta.path, nextValues);
      saveToBrowser();
      renderPage();
    },
  });
  if (hasImageSettings) {
    setupImageEditorPreview(modal);
  }
};

const openEditor = (meta) => {
  if (!state.isAdmin) {
    return;
  }

  if (meta.kind === "text") {
    openTextEditor(meta);
    return;
  }

  if (meta.kind === "image") {
    openImageEditor(meta);
    return;
  }

  if (meta.kind === "link") {
    openObjectEditor(meta, [
      { name: "label", label: "Linkin teksti", type: "text" },
      { name: "url", label: "Linkin osoite", type: "text" },
      { name: "external", label: "Avaa uuteen välilehteen", type: "checkbox" },
    ]);
    return;
  }

  if (meta.kind === "feature") {
    openObjectEditor(meta, [
      { name: "title", label: "Otsikko", type: "text" },
      { name: "text", label: "Teksti", type: "textarea" },
    ]);
    return;
  }

  if (meta.kind === "gallery-image") {
    openObjectEditor(meta, [
      {
        name: "image",
        label: "Kuva",
        type: "image",
        previewFrame: [{ tag: "figure", className: "gallery-item" }],
      },
      { name: "imageAlt", label: "Kuvan kuvaus", type: "text" },
      ...imageSettingFields(),
    ]);
    return;
  }

  if (meta.kind === "contact") {
    openObjectEditor(meta, [
      { name: "label", label: "Kentän nimi", type: "text" },
      { name: "value", label: "Kentän arvo", type: "text" },
    ]);
    return;
  }

  if (meta.kind === "event") {
    const isUpcomingList = meta.listPath === "site.tapahtumia.upcoming";
    openObjectEditor(
      {
        ...meta,
        validate: (values) => {
          if (!values.date) {
            return "Päivämäärä on pakollinen.";
          }
          if (!values.location) {
            return "Paikka on pakollinen.";
          }
          if (values.dateEnd && values.dateEnd < values.date) {
            return "Päättymispäivä ei voi olla ennen alkamispäivää.";
          }
          if (isUpcomingList) {
            if (!values.buttonLabel) {
              return "Napin teksti on pakollinen tulevalle tapahtumalle.";
            }
            if (!values.buttonUrl) {
              return "Napin linkki on pakollinen tulevalle tapahtumalle.";
            }
          }
          return null;
        },
      },
      [
        { name: "title", label: "Tapahtuman otsikko", type: "text" },
        { name: "date", label: "Päivämäärä", type: "date" },
        {
          name: "dateEnd",
          label: "Päättymispäivä (vain monipäiväiselle tapahtumalle, jätä tyhjäksi muuten)",
          type: "date",
        },
        { name: "location", label: "Sijainti", type: "text" },
        { name: "text", label: "Kuvaus", type: "textarea" },
        { name: "buttonLabel", label: "Painikkeen teksti", type: "text" },
        { name: "buttonUrl", label: "Painikkeen linkki", type: "text" },
      ],
    );
    return;
  }

  if (meta.kind === "media") {
    openObjectEditor(meta, [
      { name: "type", label: "Tyyppi", type: "select", options: ["image", "video"] },
      {
        name: "image",
        label: "Kuva (tai videon esikatselukuva)",
        type: "image",
        previewFrame: [{ tag: "figure", className: "media-item" }],
      },
      {
        name: "videoUrl",
        label: "Videon osoite",
        type: "text",
        help: "Liitä tähän suoran videotiedoston osoite (esim. .mp4). Facebook- tai Instagram-julkaisun osoite kuuluu alla olevaan linkkikenttään.",
      },
      { name: "alt", label: "Kuvan kuvaus", type: "text" },
      { name: "caption", label: "Kuvateksti", type: "text" },
      {
        name: "link",
        label: "Linkki julkaisuun (vapaaehtoinen)",
        type: "text",
        help: "Esimerkiksi Facebook- tai Instagram-julkaisun osoite.",
      },
      ...imageSettingFields(),
    ]);
    return;
  }

  if (meta.kind === "book") {
    openObjectEditor(meta, [
      { name: "title", label: "Kirjan nimi", type: "text" },
      { name: "status", label: "Tila", type: "select", options: ["Myynnissä", "Loppuunmyyty", "Tulossa"] },
      { name: "text", label: "Kuvaus", type: "textarea" },
      {
        name: "image",
        label: "Kansikuva",
        type: "image",
        previewFrame: [{ tag: "div", className: "book-card__image" }],
      },
      { name: "imageAlt", label: "Kuvan kuvaus", type: "text" },
      ...imageSettingFields(),
    ]);
    return;
  }

  if (meta.kind === "course") {
    openObjectEditor(meta, [
      { name: "title", label: "Otsikko", type: "text" },
      { name: "format", label: "Muoto", type: "text" },
      { name: "text", label: "Kuvaus", type: "textarea" },
      { name: "priceLabel", label: "Hinta tai huomautus", type: "text" },
      { name: "buyLabel", label: "Painikkeen teksti", type: "text" },
      { name: "buyUrl", label: "Painikkeen linkki", type: "text" },
      { name: "infoLabel", label: "Tarkemmat tiedot -painikkeen teksti", type: "text" },
      { name: "infoText", label: "Tarkemmat tiedot -ikkunan teksti", type: "textarea", rows: 6 },
      {
        name: "image",
        label: "Kurssin kuva",
        type: "image",
        previewFrame: [{ tag: "div", className: "course-card__image" }],
      },
      { name: "imageAlt", label: "Kuvan kuvaus", type: "text" },
      ...imageSettingFields(),
    ]);
  }
};

const openInfoOverlay = ({ title, bodyText, editMeta }) => {
  closeModal();

  const overlay = document.createElement("div");
  overlay.className = "editor-modal info-modal";

  const card = document.createElement("div");
  card.className = "editor-modal__card";

  const heading = document.createElement("h2");
  heading.textContent = title;
  card.append(heading);

  const copy = document.createElement("p");
  copy.className = "editor-modal__description";
  copy.textContent = bodyText || "Lisätietoja tulossa pian.";
  card.append(copy);

  const actions = document.createElement("div");
  actions.className = "editor-actions";

  if (state.isAdmin && editMeta) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "button button--ghost";
    editButton.textContent = "Muokkaa tekstiä";
    editButton.addEventListener("click", () => {
      closeModal();
      openTextEditor(editMeta);
    });
    actions.append(editButton);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "button";
  closeButton.textContent = "Sulje";
  closeButton.addEventListener("click", closeModal);
  actions.append(closeButton);

  card.append(actions);
  overlay.append(card);
  document.body.append(overlay);
};

const openLoginModal = () => {
  showModal({
    title: "Kirjaudu muokataksesi",
    description: "Kirjautuminen on tarkoitettu sivuston omistajalle sisällön päivitykseen.",
    submitLabel: "Kirjaudu",
    fields: [
      { name: "username", label: "Käyttäjänimi", type: "text", value: "", autocomplete: "username" },
      { name: "password", label: "Salasana", type: "password", value: "", autocomplete: "current-password" },
    ],
    onSubmit: async (values) => {
      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });

        if (!response.ok) {
          return { error: "Kirjautuminen epäonnistui. Tarkista käyttäjänimi tai salasana." };
        }
      } catch (error) {
        return {
          error:
            "Kirjautumispalvelu ei ole käytössä tässä esikatselussa. Käytä \"vercel dev\" -komentoa testataksesi kirjautumista paikallisesti.",
        };
      }

      state.isAdmin = true;
      renderPage();
      updateAdminChrome();
      updateAdminMessage("Muokkaustila käytössä.");
    },
  });
};

const submitForm = async (formType, fields, honeypot) => {
  try {
    const response = await fetch("/api/submit-form", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formType, fields, website: honeypot || "" }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      return { ok: false, error: payload.error || "Lähetys epäonnistui. Yritä myöhemmin uudelleen." };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: "Lähetys epäonnistui. Tarkista verkkoyhteys ja yritä uudelleen." };
  }
};

const handleFormSubmit = async (form, formType, successMessage) => {
  const messageNode = form.querySelector("[data-form-message]");
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const honeypot = formData.get("website");
  const fields = {};
  formData.forEach((value, key) => {
    if (key === "website") {
      return;
    }
    fields[key] = String(value).trim();
  });

  if (messageNode) {
    messageNode.hidden = true;
    messageNode.classList.remove("form-message--error", "form-message--success");
  }
  if (submitButton) {
    submitButton.disabled = true;
  }

  const result = await submitForm(formType, fields, honeypot);

  if (submitButton) {
    submitButton.disabled = false;
  }

  if (messageNode) {
    messageNode.hidden = false;
    if (result.ok) {
      messageNode.textContent = successMessage || "Kiitos! Viesti lähetettiin.";
      messageNode.classList.add("form-message--success");
      form.reset();
    } else {
      messageNode.textContent = result.error;
      messageNode.classList.add("form-message--error");
    }
  }
};

const setupPublicForms = () => {
  const bookForm = document.getElementById("book-order-form");
  if (bookForm) {
    bookForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleFormSubmit(bookForm, "book-order", state.data.site.kirjat.order.successMessage);
    });
  }

  const inquiryForm = document.getElementById("event-inquiry-form");
  if (inquiryForm) {
    inquiryForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleFormSubmit(
        inquiryForm,
        "event-inquiry",
        state.data.site.yhteystiedot.inquiry.successMessage,
      );
    });
  }
};

const checkSession = async () => {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) {
      return false;
    }
    const payload = await response.json();
    return Boolean(payload.isAdmin);
  } catch (error) {
    return false;
  }
};

const createCard = (title, textValue, meta) => {
  const article = document.createElement("article");
  article.className = "feature-card";
  if (meta) {
    registerEditable(article, meta);
  }

  const heading = document.createElement("h3");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = textValue;
  article.append(heading, paragraph);
  return article;
};

const createFooterLinks = (links) => {
  const wrapper = document.getElementById("footer-links");
  if (!wrapper) {
    return;
  }

  wrapper.innerHTML = "";
  links.forEach((link, index) => {
    const anchor = document.createElement("a");
    anchor.className = "button button--nav button--footer";
    anchor.href = link.url;
    anchor.target = link.external ? "_blank" : "_self";
    anchor.rel = link.external ? "noreferrer" : "";
    anchor.textContent = link.label;
    registerEditable(anchor, {
      kind: "link",
      path: `site.global.footerLinks.${index}`,
      title: `Muokkaa linkkiä: ${link.label}`,
    });
    wrapper.append(anchor);
  });
};

const markActiveNav = () => {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === currentPage) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
  });
};

// Three gradient-ball layers (far/mid/near) that drift autonomously like
// bubbles — up and slightly right at different speeds — plus a gentle per-layer
// horizontal wobble so the three planes feel independent rather than locked
// together. background-position is used (not transform) so a repeating tile
// shifts seamlessly forever: CSS wraps the position automatically, no seam or
// gap is ever exposed. Scroll adds a small additive depth boost on top.
const PARALLAX_LAYERS = [
  // Far plane: slowest drift, lazy wobble, barely reacts to scroll.
  { cls: "bg-parallax--far",  vx: 2.5, vy: -1.8, wobbleFreq: 0.14, wobbleAmp: 14, phase: 0,   scrollBoost: 0.06 },
  // Mid plane: medium speed, different wobble phase.
  { cls: "bg-parallax--mid",  vx: 6,   vy: -4.5, wobbleFreq: 0.22, wobbleAmp: 20, phase: 2.0, scrollBoost: 0.20 },
  // Near plane: fastest, most visible motion, strongest scroll reaction.
  { cls: "bg-parallax--near", vx: 11,  vy: -8,   wobbleFreq: 0.31, wobbleAmp: 26, phase: 4.1, scrollBoost: 0.42 },
];

const setupParallaxBackground = () => {
  if (document.querySelector(".bg-parallax")) {
    return;
  }

  // Prepend in reverse so the DOM (and paint order) ends up far → mid → near:
  // each prepend lands before the previous one, so near objects paint on top.
  const layers = [...PARALLAX_LAYERS]
    .reverse()
    .map((config) => {
      const layer = document.createElement("div");
      layer.className = `bg-parallax ${config.cls}`;
      document.body.prepend(layer);
      return { layer, ...config };
    })
    .reverse();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  let scrollY = window.scrollY;
  window.addEventListener("scroll", () => { scrollY = window.scrollY; }, { passive: true });

  let startTime = null;
  const tick = (timestamp) => {
    if (!startTime) startTime = timestamp;
    const elapsed = (timestamp - startTime) / 1000; // seconds

    layers.forEach(({ layer, vx, vy, wobbleFreq, wobbleAmp, phase, scrollBoost }) => {
      // Autonomous drift (right + up) with a per-layer sinusoidal horizontal
      // wobble so each plane sways independently, breaking the grid feel.
      const x = elapsed * vx + Math.sin(elapsed * wobbleFreq + phase) * wobbleAmp;
      // vy is negative (upward); scrollBoost shifts layers down on scroll for depth.
      const y = elapsed * vy + scrollY * scrollBoost;
      layer.style.backgroundPosition = `${x}px ${y}px`;
    });

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
};

// Fades in the header's accent rule and shadow once the page has moved, so the
// sticky bar reads as a distinct layer over content scrolling beneath it.
const setupHeaderScrollState = () => {
  const header = document.querySelector(".site-header");
  if (!header) {
    return;
  }

  let ticking = false;
  const apply = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 12);
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    },
    { passive: true },
  );
  apply();
};

// Clips are muted and never autoplay. On a mouse they start on hover and reset
// on leave; touch devices have no hover, so there a tap toggles playback.
const attachHoverPlayback = (article, video) => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const start = () => {
    const attempt = video.play();
    if (attempt && typeof attempt.then === "function") {
      attempt.then(() => article.classList.add("is-playing")).catch(() => {});
    } else {
      article.classList.add("is-playing");
    }
  };

  const stop = () => {
    video.pause();
    video.currentTime = 0;
    article.classList.remove("is-playing");
  };

  article.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse" && !prefersReducedMotion) {
      start();
    }
  });

  article.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") {
      stop();
    }
  });

  article.addEventListener("click", (event) => {
    // In edit mode a click belongs to the editor, not to playback.
    if (state.isAdmin || event.target.closest("a")) {
      return;
    }
    if (video.paused) {
      start();
    } else {
      stop();
    }
  });
};

const isDirectVideoSource = (value) => {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) && /\.(mp4|webm|mov)$/i.test(url.pathname);
  } catch (error) {
    return false;
  }
};

// Facebook reels/videos aren't direct video files -- they can't be played in
// a <video> tag -- but Facebook's own embedded player can show them inline
// via an iframe, so a card linking to one of these gets a click-to-load
// embed instead of just a "goes to Facebook" pill.
const isFacebookVideoLink = (value) => {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) && /(^|\.)(facebook\.com|fb\.watch)$/i.test(url.hostname);
  } catch (error) {
    return false;
  }
};

const createMediaItem = (item, meta) => {
  const figure = document.createElement("figure");
  figure.className = "media-item";
  registerEditable(figure, meta);

  const videoUrl = isDirectVideoSource(item.videoUrl) ? item.videoUrl : "";
  const mediaLink = item.link || (!videoUrl && item.videoUrl ? item.videoUrl : "");
  const isVideo = item.type === "video" && videoUrl;
  const isFacebookEmbed = !isVideo && item.type === "video" && isFacebookVideoLink(mediaLink);

  let posterNode = null;

  if (isVideo) {
    const video = document.createElement("video");
    video.src = videoUrl;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.controls = false;
    // metadata only: nothing downloads the whole clip until it is played.
    video.preload = "metadata";
    if (item.image) {
      video.poster = item.image;
    }
    applyImageSettings(video, item);
    figure.append(video);

    const play = document.createElement("span");
    play.className = "media-item__play";
    play.textContent = "▶ Video";
    figure.append(play);

    attachHoverPlayback(figure, video);
  } else if (isFacebookEmbed) {
    // The image field is meant for an actual thumbnail. If someone pastes
    // the Facebook link in there too, treat it the same as no poster rather
    // than trying (and failing) to load Facebook's page as an <img>.
    const hasPoster = item.image && !isFacebookVideoLink(item.image);
    if (hasPoster) {
      const poster = document.createElement("img");
      poster.alt = item.alt || "";
      prepareImage(poster, item.image);
      applyImageSettings(poster, item);
      markLazyImage(poster);
      figure.append(poster);
      posterNode = poster;
    } else {
      const fallback = document.createElement("div");
      fallback.className = "media-item__fallback";
      fallback.textContent = "Katso video Facebookissa";
      figure.append(fallback);
      posterNode = fallback;
    }

    const play = document.createElement("span");
    play.className = "media-item__play";
    play.textContent = "▶ Katso video";
    figure.append(play);

    // Facebook's plugin can end up stuck (e.g. after its own internal "view
    // on Facebook" link is clicked and it fails to re-render), so a fresh
    // iframe is cheap to build and swap in without reloading the whole page.
    const buildFacebookIframe = () => {
      const iframe = document.createElement("iframe");
      iframe.className = "media-item__fb-iframe";
      iframe.src = `https://www.facebook.com/plugins/video.php?height=600&href=${encodeURIComponent(mediaLink)}&show_text=false&width=400&autoplay=false`;
      iframe.setAttribute("width", "100%");
      iframe.setAttribute("height", "100%");
      iframe.loading = "lazy";
      iframe.allow = "clipboard-write; encrypted-media; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      return iframe;
    };

    figure.classList.add("media-item--fb-loadable");
    let embedLoaded = false;
    figure.addEventListener("click", (event) => {
      if (state.isAdmin || event.target.closest("a, button") || embedLoaded) {
        return;
      }
      embedLoaded = true;

      let currentIframe = buildFacebookIframe();
      posterNode.replaceWith(currentIframe);
      play.remove();

      const reload = document.createElement("button");
      reload.type = "button";
      reload.className = "media-item__reload";
      reload.textContent = "↻ Lataa video uudelleen";
      reload.addEventListener("click", (reloadEvent) => {
        reloadEvent.stopPropagation();
        const fresh = buildFacebookIframe();
        currentIframe.replaceWith(fresh);
        currentIframe = fresh;
      });
      figure.append(reload);
    });
  } else if (item.image) {
    const image = document.createElement("img");
    image.alt = item.alt || "";
    prepareImage(image, item.image);
    applyImageSettings(image, item);
    markLazyImage(image);
    figure.append(image);
  } else if (mediaLink) {
    const fallback = document.createElement("div");
    fallback.className = "media-item__fallback";
    fallback.textContent = "Video avautuu sosiaalisessa mediassa";
    figure.append(fallback);
  }

  if (mediaLink) {
    const link = document.createElement("a");
    link.className = "media-item__link";
    link.href = mediaLink;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.type === "video" ? "Avaa video" : "Avaa julkaisu";
    figure.append(link);
  }

  if (item.caption) {
    const caption = document.createElement("figcaption");
    caption.className = "media-item__caption";
    caption.textContent = item.caption;
    figure.append(caption);
  }

  // When there's no playable inline video or embed, the whole card should
  // open the linked post -- otherwise only the small corner pill was
  // clickable and tapping the big preview area (the obvious target) did
  // nothing.
  if (mediaLink && !isVideo && !isFacebookEmbed) {
    figure.classList.add("media-item--linked");
    figure.addEventListener("click", (event) => {
      if (state.isAdmin || event.target.closest("a")) {
        return;
      }
      window.open(mediaLink, "_blank", "noopener,noreferrer");
    });
  }

  return figure;
};

const renderMediaWall = (media) => {
  const wall = document.getElementById("media-wall");
  if (!wall) {
    return;
  }

  text("media-title", media?.title, {
    kind: "text",
    path: "site.tapahtumia.media.title",
    title: "Muokkaa kuva- ja video-osion otsikkoa",
  });
  text("media-note", media?.note, {
    kind: "text",
    path: "site.tapahtumia.media.note",
    title: "Muokkaa kuva- ja video-osion tekstiä",
    rows: 4,
  });

  wall.innerHTML = "";
  const items = media?.items || [];

  if (items.length === 0 && !state.isAdmin) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Ei vielä kuvia tai videoita.";
    wall.append(empty);
    return;
  }

  items.forEach((item, index) => {
    wall.append(
      createMediaItem(item, {
        kind: "media",
        path: `site.tapahtumia.media.items.${index}`,
        listPath: "site.tapahtumia.media.items",
        index,
        title: `Muokkaa kuvaa tai videota ${index + 1}`,
      }),
    );
  });

  if (state.isAdmin) {
    wall.append(
      createAddTile("+ Lisää kuva tai video", "media-item", () =>
        addListItem(
          "site.tapahtumia.media.items",
          {
            type: "image",
            image: "assets/uploads/event-placeholder.svg",
            videoUrl: "",
            alt: "Uusi kuva",
            caption: "",
            link: "",
          },
          { kind: "media", title: "Muokkaa uutta kuvaa tai videota" },
        ),
      ),
    );
  }
};

const setupMenu = () => {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.getElementById("site-nav");
  if (!toggle || !nav) {
    return;
  }

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Sulje valikko" : "Avaa valikko");
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Avaa valikko");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Avaa valikko");
      toggle.focus();
    }
  });
};

const renderHome = (home) => {
  text("home-hero-kicker", home.hero.kicker, {
    kind: "text",
    path: "site.home.hero.kicker",
    title: "Muokkaa yläosan tunnuslausetta",
  });
  text("home-hero-title", home.hero.title, {
    kind: "text",
    path: "site.home.hero.title",
    title: "Muokkaa pääotsikkoa",
  });
  text("home-hero-text", home.hero.text, {
    kind: "text",
    path: "site.home.hero.text",
    title: "Muokkaa johdantotekstiä",
    rows: 6,
  });
  text("home-primary-cta", home.hero.primaryCtaLabel, {
    kind: "text",
    path: "site.home.hero.primaryCtaLabel",
    title: "Muokkaa päänapin tekstiä",
  });
  text("home-secondary-cta", home.hero.secondaryCtaLabel, {
    kind: "text",
    path: "site.home.hero.secondaryCtaLabel",
    title: "Muokkaa toisen napin tekstiä",
  });
  setImage("home-hero-image", home.hero.image, home.hero.imageAlt, {
    kind: "image",
    path: "site.home.hero.image",
    altPath: "site.home.hero.imageAlt",
    title: "Muokkaa pääkuvaa",
  });
  text("home-hero-badge", home.hero.badge, {
    kind: "text",
    path: "site.home.hero.badge",
    title: "Muokkaa merkin tekstiä",
  });
  text("home-intro-title", home.intro.title, {
    kind: "text",
    path: "site.home.intro.title",
    title: "Muokkaa esittelyn otsikkoa",
  });
  text("home-intro-text", home.intro.text, {
    kind: "text",
    path: "site.home.intro.text",
    title: "Muokkaa esittelytekstiä",
    rows: 8,
  });

  const grid = document.getElementById("home-feature-grid");
  if (grid) {
    grid.innerHTML = "";
    home.features.forEach((feature, index) => {
      grid.append(
        createCard(feature.title, feature.text, {
          kind: "feature",
          path: `site.home.features.${index}`,
          listPath: "site.home.features",
          index,
          title: `Muokkaa kohokohtaa ${index + 1}`,
        }),
      );
    });
    if (state.isAdmin) {
      grid.append(
        createAddTile("+ Lisää kohokohta", "feature-card", () =>
          addListItem(
            "site.home.features",
            { title: "Uusi kohokohta", text: "Klikkaa tätä korttia muokataksesi tekstiä." },
            { kind: "feature", title: "Muokkaa uutta kohokohtaa" },
          ),
        ),
      );
    }
  }

  text("home-gallery-title", home.gallery?.title, {
    kind: "text",
    path: "site.home.gallery.title",
    title: "Muokkaa kuvagallerian otsikkoa",
  });

  const gallery = document.getElementById("home-gallery");
  if (gallery) {
    gallery.innerHTML = "";
    (home.gallery?.images || []).forEach((item, index) => {
      const figure = document.createElement("figure");
      figure.className = "gallery-item";
      registerEditable(figure, {
        kind: "gallery-image",
        path: `site.home.gallery.images.${index}`,
        listPath: "site.home.gallery.images",
        index,
        title: `Muokkaa kuvaa ${index + 1}`,
      });

      const image = document.createElement("img");
      image.alt = item.imageAlt || "";
      prepareImage(image, item.image);
      applyImageSettings(image, item);
      markLazyImage(image);
      figure.append(image);
      gallery.append(figure);
    });
    if (state.isAdmin) {
      gallery.append(
        createAddTile("+ Lisää kuva", "gallery-item", () =>
          addListItem(
            "site.home.gallery.images",
            { image: "assets/uploads/portrait-placeholder.svg", imageAlt: "Uusi kuva" },
            { kind: "gallery-image", title: "Muokkaa uutta kuvaa" },
          ),
        ),
      );
    }
  }
};

const renderPalvelut = (palvelut, site) => {
  text("palvelut-title", palvelut.title, {
    kind: "text",
    path: "site.palvelut.title",
    title: "Muokkaa Palvelut-sivun otsikkoa",
  });
  text("palvelut-lead", palvelut.lead, {
    kind: "text",
    path: "site.palvelut.lead",
    title: "Muokkaa Palvelut-sivun johdantoa",
    rows: 5,
  });
  setImage("palvelut-image", palvelut.image, palvelut.imageAlt, {
    kind: "image",
    path: "site.palvelut.image",
    altPath: "site.palvelut.imageAlt",
    title: "Muokkaa Palvelut-sivun kuvaa",
  });

  const grid = document.getElementById("palvelut-grid");
  if (grid) {
    grid.innerHTML = "";
    palvelut.courses.forEach((course, index) => {
      const article = document.createElement("article");
      article.className = "store-card";
      registerEditable(article, {
        kind: "course",
        path: `site.palvelut.courses.${index}`,
        listPath: "site.palvelut.courses",
        index,
        title: `Muokkaa kurssia ${index + 1}`,
      });

      const image = document.createElement("img");
      image.alt = course.imageAlt || course.title;
      prepareImage(image, course.image);
      applyImageSettings(image, course);
      markLazyImage(image);

      const imageFrame = document.createElement("div");
      imageFrame.className = "image-frame course-card__image";
      imageFrame.append(image);

      const meta = document.createElement("div");
      meta.className = "store-card__meta";
      if (course.format) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = course.format;
        meta.append(pill);
      }

      const heading = document.createElement("h3");
      heading.textContent = course.title;

      const paragraph = document.createElement("p");
      paragraph.textContent = course.text;

      const price = document.createElement("p");
      price.className = "price";
      price.textContent = course.priceLabel;

      const actions = document.createElement("div");
      actions.className = "store-card__actions";

      if (course.buyUrl) {
        const buy = document.createElement("a");
        buy.className = "button";
        buy.href = course.buyUrl;
        buy.textContent = course.buyLabel || "Ota yhteyttä";
        actions.append(buy);
      }

      if (course.infoText) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "button button--secondary";
        more.textContent = course.infoLabel || "Tarkemmat tiedot";
        more.addEventListener("click", (event) => {
          event.stopPropagation();
          openInfoOverlay({
            title: course.title,
            bodyText: course.infoText,
            editMeta: {
              path: `site.palvelut.courses.${index}.infoText`,
              title: `Muokkaa: ${course.title}`,
              rows: 6,
            },
          });
        });
        actions.append(more);
      }

      article.append(imageFrame, meta, heading, paragraph, price, actions);
      grid.append(article);
    });
    if (state.isAdmin) {
      grid.append(
        createAddTile("+ Lisää kurssi", "store-card", () =>
          addListItem(
            "site.palvelut.courses",
            {
              title: "Uusi kurssi",
              format: "Muoto",
              text: "Kuvaile kurssi tässä.",
              priceLabel: "Kysy hintaa",
              buyLabel: "Tiedustele sähköpostilla",
              buyUrl: "mailto:marjoseki@hotmail.com?subject=Uusi%20kurssi",
              infoLabel: "Tarkemmat tiedot",
              infoText: "Kirjoita tähän kurssin tarkemmat tiedot.",
              image: "assets/uploads/food-placeholder.svg",
              imageAlt: "Uuden kurssin kuva",
            },
            { kind: "course", title: "Muokkaa uutta kurssia" },
          ),
        ),
      );
    }
  }

  // Modelled as Service rather than Course on purpose: Google's Course rich
  // result requires hasCourseInstance (concrete dates), which these listings
  // don't carry, and emitting it without would only raise Search Console
  // warnings. Dated happenings are published as Event on the Tapahtumia page.
  const courseItems = (palvelut.courses || [])
    .filter((course) => course.title)
    .map((course) => {
      const entry = {
        "@type": "Service",
        name: course.title,
        provider: { "@type": "Person", name: site.siteName, url: `${SITE_ORIGIN}/` },
        areaServed: { "@type": "Country", name: "Suomi" },
        url: absoluteUrl("palvelut.html"),
      };
      if (course.text) {
        entry.description = course.text;
      }
      if (course.format) {
        entry.serviceType = course.format;
      }
      if (course.image) {
        entry.image = absoluteUrl(course.image);
      }
      return entry;
    });

  setStructuredData(
    "ld-services",
    courseItems.length
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: palvelut.title || "Palvelut",
          itemListElement: courseItems.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item,
          })),
        }
      : null,
  );
};

const BOOK_STATUS_CLASSES = {
  Myynnissä: "book-status--available",
  Loppuunmyyty: "book-status--sold-out",
  Tulossa: "book-status--coming-soon",
};

const selectBookForOrder = (title) => {
  const select = document.getElementById("book-order-select");
  if (select) {
    select.value = title;
  }
  document.getElementById("book-order-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const createBookCard = (book, meta) => {
  const article = document.createElement("article");
  article.className = "store-card book-card";
  registerEditable(article, meta);

  const imageWrap = document.createElement("div");
  imageWrap.className = "book-card__image";

  const image = document.createElement("img");
  image.alt = book.imageAlt || book.title;
  prepareImage(image, book.image);
  applyImageSettings(image, book);
  markLazyImage(image);
  imageWrap.append(image);

  if (book.status) {
    const badge = document.createElement("span");
    badge.className = `book-status ${BOOK_STATUS_CLASSES[book.status] || ""}`.trim();
    badge.textContent = book.status;
    imageWrap.append(badge);
  }

  const heading = document.createElement("h3");
  heading.textContent = book.title;

  const paragraph = document.createElement("p");
  paragraph.textContent = book.text;

  article.append(imageWrap, heading, paragraph);

  if (book.status === "Myynnissä") {
    const actions = document.createElement("div");
    actions.className = "store-card__actions";

    const orderButton = document.createElement("button");
    orderButton.type = "button";
    orderButton.className = "button button--secondary";
    orderButton.textContent = "Tilaa tämä kirja";
    orderButton.addEventListener("click", (event) => {
      event.stopPropagation();
      selectBookForOrder(book.title);
    });
    actions.append(orderButton);

    article.append(actions);
  }

  return article;
};

const renderKirjat = (kirjat, site) => {
  text("kirjat-title", kirjat.title, {
    kind: "text",
    path: "site.kirjat.title",
    title: "Muokkaa Kirjat-sivun otsikkoa",
  });
  text("kirjat-lead", kirjat.lead, {
    kind: "text",
    path: "site.kirjat.lead",
    title: "Muokkaa Kirjat-sivun johdantoa",
    rows: 5,
  });
  setImage("kirjat-image", kirjat.image, kirjat.imageAlt, {
    kind: "image",
    path: "site.kirjat.image",
    altPath: "site.kirjat.imageAlt",
    title: "Muokkaa Kirjat-sivun kuvaa",
  });

  const grid = document.getElementById("kirjat-grid");
  if (grid) {
    grid.innerHTML = "";
    (kirjat.books || []).forEach((book, index) => {
      grid.append(
        createBookCard(book, {
          kind: "book",
          path: `site.kirjat.books.${index}`,
          listPath: "site.kirjat.books",
          index,
          title: `Muokkaa kirjaa ${index + 1}`,
        }),
      );
    });
    if (state.isAdmin) {
      grid.append(
        createAddTile("+ Lisää kirja", "store-card book-card", () =>
          addListItem(
            "site.kirjat.books",
            {
              title: "Uusi kirja",
              status: "Tulossa",
              text: "Kuvaile kirja tässä.",
              image: "assets/uploads/books-placeholder.svg",
              imageAlt: "Uuden kirjan kansi",
            },
            { kind: "book", title: "Muokkaa uutta kirjaa" },
          ),
        ),
      );
    }
  }

  const bookItems = (kirjat.books || [])
    .filter((book) => book.title)
    .map((book) => {
      const entry = {
        "@type": "Book",
        name: book.title,
        author: { "@type": "Person", name: site.siteName, url: `${SITE_ORIGIN}/` },
        inLanguage: "fi",
        url: absoluteUrl("kirjat.html"),
      };
      if (book.text) {
        entry.description = book.text;
      }
      if (book.image) {
        entry.image = absoluteUrl(book.image);
      }
      return entry;
    });

  setStructuredData(
    "ld-books",
    bookItems.length
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: kirjat.title || "Kirjat",
          itemListElement: bookItems.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item,
          })),
        }
      : null,
  );

  setImage("kirjat-order-image", kirjat.order.image, kirjat.order.imageAlt, {
    kind: "image",
    path: "site.kirjat.order.image",
    altPath: "site.kirjat.order.imageAlt",
    title: "Muokkaa tilauslomakkeen kuvaa",
  });

  text("kirjat-order-title", kirjat.order.title, {
    kind: "text",
    path: "site.kirjat.order.title",
    title: "Muokkaa tilausosion otsikkoa",
  });
  text("kirjat-order-instructions", kirjat.order.instructions, {
    kind: "text",
    path: "site.kirjat.order.instructions",
    title: "Muokkaa maksu- ja toimitusohjeita",
    rows: 6,
  });

  const select = document.getElementById("book-order-select");
  if (select) {
    const previousValue = select.value;
    select.innerHTML = "";
    const availableBooks = (kirjat.books || []).filter((book) => book.status === "Myynnissä");

    if (availableBooks.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Ei tällä hetkellä myynnissä olevia kirjoja";
      select.append(option);
      select.disabled = true;
    } else {
      select.disabled = false;
      availableBooks.forEach((book) => {
        const option = document.createElement("option");
        option.value = book.title;
        option.textContent = book.title;
        select.append(option);
      });
      if (availableBooks.some((book) => book.title === previousValue)) {
        select.value = previousValue;
      }
    }
  }
};

const renderYhteystiedot = (yhteystiedot, site) => {
  text("yhteystiedot-title", yhteystiedot.title, {
    kind: "text",
    path: "site.yhteystiedot.title",
    title: "Muokkaa Yhteystiedot-sivun otsikkoa",
  });
  text("yhteystiedot-lead", yhteystiedot.lead, {
    kind: "text",
    path: "site.yhteystiedot.lead",
    title: "Muokkaa Yhteystiedot-sivun johdantoa",
    rows: 5,
  });
  setImage("yhteystiedot-image", yhteystiedot.image, yhteystiedot.imageAlt, {
    kind: "image",
    path: "site.yhteystiedot.image",
    altPath: "site.yhteystiedot.imageAlt",
    title: "Muokkaa Yhteystiedot-sivun kuvaa",
  });

  const contactList = document.getElementById("contact-list");
  if (contactList) {
    contactList.innerHTML = "";
    yhteystiedot.contactItems.forEach((item, index) => {
      const block = document.createElement("div");
      block.className = "contact-item";
      registerEditable(block, {
        kind: "contact",
        path: `site.yhteystiedot.contactItems.${index}`,
        listPath: "site.yhteystiedot.contactItems",
        index,
        title: `Muokkaa yhteystietoa ${index + 1}`,
      });
      const heading = document.createElement("strong");
      heading.textContent = item.label;
      const paragraph = document.createElement("p");
      paragraph.textContent = item.value;
      block.append(heading, paragraph);
      contactList.append(block);
    });
    if (state.isAdmin) {
      contactList.append(
        createAddTile("+ Lisää yhteystieto", "contact-item", () =>
          addListItem(
            "site.yhteystiedot.contactItems",
            { label: "Uusi kenttä", value: "Lisää arvo" },
            { kind: "contact", title: "Muokkaa uutta yhteystietoa" },
          ),
        ),
      );
    }
  }

  text("inquiry-title", yhteystiedot.inquiry?.title, {
    kind: "text",
    path: "site.yhteystiedot.inquiry.title",
    title: "Muokkaa kyselylomakkeen otsikkoa",
  });
  text("inquiry-intro", yhteystiedot.inquiry?.intro, {
    kind: "text",
    path: "site.yhteystiedot.inquiry.intro",
    title: "Muokkaa kyselylomakkeen johdantoa",
    rows: 4,
  });
  setImage("inquiry-image", yhteystiedot.inquiry?.image, yhteystiedot.inquiry?.imageAlt, {
    kind: "image",
    path: "site.yhteystiedot.inquiry.image",
    altPath: "site.yhteystiedot.inquiry.imageAlt",
    title: "Muokkaa tilaisuuskyselyn kuvaa",
  });
};

const parseEventDate = (value) => {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  const monthNames = {
    tammi: 0,
    helmi: 1,
    maalis: 2,
    huhti: 3,
    touko: 4,
    kesä: 5,
    heinä: 6,
    elo: 7,
    syys: 8,
    loka: 9,
    marras: 10,
    joulu: 11,
  };

  const simpleDate = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (simpleDate) {
    const [, day, month, year] = simpleDate;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const monthDate = trimmed.match(/^([A-Za-zäöÅÄÖ]+)\s+(\d{4})$/i);
  if (monthDate) {
    const [, monthLabel, year] = monthDate;
    const normalized = monthLabel.toLowerCase();
    const monthIndex = monthNames[normalized];
    if (typeof monthIndex === "number") {
      return new Date(Number(year), monthIndex, 1);
    }
  }

  const isoDate = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  return null;
};

const isPastEvent = (event) => {
  const parsed = parseEventDate(event.dateEnd || event.date);
  if (!parsed) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed < today;
};

const recentCutoff = (referenceDate = new Date()) => {
  const cutoff = new Date(referenceDate);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - RECENT_EVENT_DAYS);
  return cutoff;
};

const isWithinRecentEventWindow = (event, referenceDate = new Date()) => {
  const parsed = parseEventDate(event.dateEnd || event.date);
  if (!parsed) {
    return false;
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  return parsed >= recentCutoff(referenceDate) && parsed < today;
};

// Native <input type="date"> values are always "YYYY-MM-DD"; format those
// into the Finnish d.m.yyyy style used elsewhere on the site. Older
// freeform date text (entered before the date picker existed) is left
// exactly as it was published.
const formatEventDateDisplay = (event) => {
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoPattern.test(event.date || "")) {
    return event.date || "";
  }

  const start = parseEventDate(event.date);
  if (!event.dateEnd || event.dateEnd === event.date || !isoPattern.test(event.dateEnd)) {
    return `${start.getDate()}.${start.getMonth() + 1}.${start.getFullYear()}`;
  }

  const end = parseEventDate(event.dateEnd);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}.–${end.getDate()}.${start.getMonth() + 1}.${start.getFullYear()}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}.${start.getMonth() + 1}.–${end.getDate()}.${end.getMonth() + 1}.${start.getFullYear()}`;
  }
  return `${start.getDate()}.${start.getMonth() + 1}.${start.getFullYear()}–${end.getDate()}.${end.getMonth() + 1}.${end.getFullYear()}`;
};

const compareEventDates = (left, right) => {
  const leftDate = parseEventDate(left.date);
  const rightDate = parseEventDate(right.date);

  if (!leftDate && !rightDate) {
    return 0;
  }

  if (!leftDate) {
    return 1;
  }

  if (!rightDate) {
    return -1;
  }

  return rightDate - leftDate;
};

const createEventCard = (event, meta, isPast = false) => {
  const article = document.createElement("article");
  article.className = "event-card";
  registerEditable(article, meta);

  const metaRow = document.createElement("div");
  metaRow.className = "event-card__meta";
  [formatEventDateDisplay(event), event.location].filter(Boolean).forEach((value) => {
    const pill = document.createElement("span");
    pill.className = isPast ? "pill pill--muted" : "pill";
    pill.textContent = value;
    metaRow.append(pill);
  });

  const heading = document.createElement("h3");
  heading.textContent = event.title;

  const paragraph = document.createElement("p");
  paragraph.textContent = event.text;
  article.append(metaRow, heading, paragraph);

  if (!isPast && event.buttonLabel && event.buttonUrl) {
    const link = document.createElement("a");
    link.className = "button button--secondary";
    link.href = event.buttonUrl;
    link.textContent = event.buttonLabel;
    article.append(link);
  }

  return article;
};

const renderTapahtumia = (tapahtumia, site) => {
  text("tapahtumia-title", tapahtumia.title, {
    kind: "text",
    path: "site.tapahtumia.title",
    title: "Muokkaa Tapahtumia-sivun otsikkoa",
  });
  text("tapahtumia-lead", tapahtumia.lead, {
    kind: "text",
    path: "site.tapahtumia.lead",
    title: "Muokkaa Tapahtumia-sivun johdantoa",
    rows: 5,
  });
  setImage("tapahtumia-image", tapahtumia.image, tapahtumia.imageAlt, {
    kind: "image",
    path: "site.tapahtumia.image",
    altPath: "site.tapahtumia.imageAlt",
    title: "Muokkaa Tapahtumia-sivun kuvaa",
  });
  renderMediaWall(tapahtumia.media);

  const upcomingEntries = (tapahtumia.upcoming || []).map((event, index) => ({
    event,
    meta: {
      kind: "event",
      path: `site.tapahtumia.upcoming.${index}`,
      listPath: "site.tapahtumia.upcoming",
      index,
      title: `Muokkaa tulevaa tapahtumaa ${index + 1}`,
    },
  }));
  const upcomingEvents = upcomingEntries.filter(({ event }) => !isPastEvent(event));
  const pastEntries = (tapahtumia.past || []).map((event, index) => ({
    event,
    meta: {
      kind: "event",
      path: `site.tapahtumia.past.${index}`,
      listPath: "site.tapahtumia.past",
      index,
      title: `Muokkaa mennyttä tapahtumaa ${index + 1}`,
    },
  }));
  const upcomingPastEntries = upcomingEntries.filter(({ event }) => isPastEvent(event));
  const recentEntries = [...pastEntries, ...upcomingPastEntries]
    .filter(({ event }) => isWithinRecentEventWindow(event))
    .sort((left, right) => compareEventDates(left.event, right.event))
    .slice(0, 4);

  const newUpcomingEvent = () => ({
    title: "Uusi tuleva tapahtuma",
    date: "",
    dateEnd: "",
    location: "",
    text: "Kuvaile tapahtuma tässä.",
    buttonLabel: "Kysy lisää",
    buttonUrl: "mailto:marjoseki@hotmail.com?subject=Tapahtumakysymys",
  });
  const newPastEvent = () => ({
    title: "Uusi mennyt tapahtuma",
    date: "",
    dateEnd: "",
    location: "",
    text: "Kuvaile tapahtuma tässä.",
    buttonLabel: "",
    buttonUrl: "",
  });

  const list = document.getElementById("events-list");
  if (list) {
    list.innerHTML = "";

    if (upcomingEvents.length === 0 && !state.isAdmin) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Ei tulevia tapahtumia juuri nyt.";
      list.append(empty);
    } else {
      upcomingEvents.forEach(({ event, meta }) => {
        list.append(createEventCard(event, meta));
      });
    }

    if (state.isAdmin) {
      list.append(
        createAddTile("+ Lisää tuleva tapahtuma", "event-card", () =>
          addListItem("site.tapahtumia.upcoming", newUpcomingEvent(), {
            kind: "event",
            title: "Muokkaa uutta tulevaa tapahtumaa",
          }),
        ),
      );
    }
  }

  const pastList = document.getElementById("past-events-list");
  if (pastList) {
    pastList.innerHTML = "";

    if (recentEntries.length === 0 && !state.isAdmin) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Ei vielä viimeaikaisia hetkiä.";
      pastList.append(empty);
    } else {
      recentEntries.forEach(({ event, meta }) => {
        pastList.append(createEventCard(event, meta, true));
      });
    }

    if (state.isAdmin) {
      pastList.append(
        createAddTile("+ Lisää mennyt tapahtuma", "event-card", () =>
          addListItem("site.tapahtumia.past", newPastEvent(), {
            kind: "event",
            title: "Muokkaa uutta mennyttä tapahtumaa",
          }),
        ),
      );
    }
  }

  // Google's event rich results need a machine-readable startDate, so only
  // events whose date actually parses are published as structured data.
  const eventItems = upcomingEvents
    .map(({ event }) => {
      const startDate = toIsoDate(event.date);
      if (!startDate || !event.title) {
        return null;
      }

      const entry = {
        "@type": "Event",
        name: event.title,
        startDate,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        url: absoluteUrl("tapahtumia.html"),
        organizer: { "@type": "Person", name: site.siteName, url: `${SITE_ORIGIN}/` },
        performer: { "@type": "Person", name: site.siteName },
      };

      const endDate = toIsoDate(event.dateEnd);
      if (endDate && endDate !== startDate) {
        entry.endDate = endDate;
      }
      if (event.location) {
        entry.location = { "@type": "Place", name: event.location };
      }
      if (event.text) {
        entry.description = event.text;
      }
      return entry;
    })
    .filter(Boolean);

  setStructuredData(
    "ld-events",
    eventItems.length
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: tapahtumia.title || "Tapahtumia",
          itemListElement: eventItems.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item,
          })),
        }
      : null,
  );

};

const renderGlobal = (data) => {
  text("brand-name", data.siteName, {
    kind: "text",
    path: "site.global.siteName",
    title: "Muokkaa sivuston nimeä",
  });
  text("brand-eyebrow", data.brandLine, {
    kind: "text",
    path: "site.global.brandLine",
    title: "Muokkaa brändilausetta",
  });
  text("footer-name", data.siteName, {
    kind: "text",
    path: "site.global.siteName",
    title: "Muokkaa sivuston nimeä",
  });
  text("footer-tagline", data.footerTagline, {
    kind: "text",
    path: "site.global.footerTagline",
    title: "Muokkaa alatunnisteen tekstiä",
    rows: 4,
  });
  createFooterLinks(data.footerLinks);
};

const loadSite = async () => {
  const siteResponse = await fetch("content/site.json", { cache: "no-store" });

  if (!siteResponse.ok) {
    throw new Error("Sisältötiedoston lataus epäonnistui.");
  }

  const fallback = { site: await siteResponse.json() };

  const localCopy = localStorage.getItem(STORAGE_KEY);
  if (!localCopy) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(localCopy);
    const savedAt = parsed && parsed.savedAt;
    const data = parsed && parsed.data;
    if (!data || typeof savedAt !== "number" || Date.now() - savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return fallback;
    }
    return data;
  } catch (error) {
    console.error("Tallennetun sisällön jäsentäminen epäonnistui.", error);
    return fallback;
  }
};

// The admin bar's height varies (button row wraps differently depending on
// viewport width and how many page-specific actions the current page adds),
// so the body offset that keeps it from covering the nav below is measured
// live instead of guessed as a fixed value.
const syncAdminBarOffset = () => {
  const bar = document.querySelector(".admin-bar");
  document.documentElement.style.setProperty("--admin-bar-offset", bar ? `${bar.offsetHeight}px` : "0px");
};

let adminBarResizeObserver = null;

const createAdminChrome = () => {
  if (document.querySelector(".admin-bar")) {
    return;
  }

  const bar = document.createElement("div");
  bar.className = "admin-bar";
  bar.innerHTML = `
    <div class="admin-bar__inner">
      <div class="admin-bar__copy">
        <strong>Muokkaustila</strong>
        <span data-admin-message>Muokkaustila käytössä.</span>
      </div>
      <div class="admin-bar__actions">
        <button type="button" class="button" data-admin-action="publish">Julkaise sivulle</button>
        <button type="button" class="button button--ghost" data-admin-action="restore-draft">Hae luonnos toiselta laitteelta</button>
        <button type="button" class="button button--ghost" data-admin-action="reset">Peru tallentamattomat muutokset</button>
        <button type="button" class="button button--danger" data-admin-action="logout">Kirjaudu ulos</button>
      </div>
    </div>
  `;
  document.body.append(bar);

  if ("ResizeObserver" in window) {
    adminBarResizeObserver?.disconnect();
    adminBarResizeObserver = new ResizeObserver(syncAdminBarOffset);
    adminBarResizeObserver.observe(bar);
  }
  syncAdminBarOffset();
};

// metaTemplate, if given, opens the new item's editor immediately after it's
// added -- important for lists like Tapahtumia's "menneet" events, where the
// freshly added blank card might not even be visible in its own filtered
// display (recent-only, capped) for the admin to go find and click.
const addListItem = (path, item, metaTemplate) => {
  const confirmed = confirm(
    "Lisätäänkö UUSI, tyhjä kortti listan loppuun? Voit täyttää sen tiedot heti seuraavaksi avautuvassa ikkunassa.",
  );
  if (!confirmed) {
    return;
  }
  const list = getByPath(state.data, path);
  list.push(item);
  const index = list.length - 1;
  saveToBrowser();
  renderPage();
  if (metaTemplate) {
    openEditor({ ...metaTemplate, path: `${path}.${index}`, listPath: path, index });
  }
};

const createAddTile = (label, className, onClick) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `add-tile ${className}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
};

// Edit mode has to be operable without a mouse. While signed in, every
// editable region becomes a real control (tab stop + accessible name + visible
// affordance); on sign-out the attributes are handed back so visitors get
// clean, unannotated markup.
const refreshEditableAffordances = () => {
  document.querySelectorAll(".editable-target").forEach((node) => {
    if (!state.isAdmin) {
      node.removeAttribute("tabindex");
      node.removeAttribute("role");
      node.removeAttribute("aria-label");
      node.removeAttribute("title");
      return;
    }

    const label = node.dataset.editLabel || "Muokkaa";
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", label);
    node.setAttribute("title", label);
  });
};

const updateAdminChrome = () => {
  // Runs on every render and on sign-in/sign-out, so it is the single place
  // that keeps the editable affordances in step with the session.
  refreshEditableAffordances();

  if (!state.isAdmin) {
    document.body.classList.remove("admin-mode");
    document.querySelector(".admin-bar")?.remove();
    adminBarResizeObserver?.disconnect();
    adminBarResizeObserver = null;
    return;
  }

  createAdminChrome();
  document.body.classList.add("admin-mode");
  syncAdminBarOffset();
};

const renderPage = () => {
  renderGlobal(state.data.site.global);

  if (currentPage === "home") {
    renderHome(state.data.site.home);
  }

  if (currentPage === "palvelut") {
    renderPalvelut(state.data.site.palvelut, state.data.site.global);
  }

  if (currentPage === "kirjat") {
    renderKirjat(state.data.site.kirjat, state.data.site.global);
  }

  if (currentPage === "yhteystiedot") {
    renderYhteystiedot(state.data.site.yhteystiedot, state.data.site.global);
  }

  if (currentPage === "tapahtumia") {
    renderTapahtumia(state.data.site.tapahtumia, state.data.site.global);
  }

  // The page hero is the LCP element; every other image is deferred below it.
  document.querySelectorAll(".site-image").forEach(markLazyImage);
  // The page hero is the LCP element; the inquiry illustration further down
  // the Yhteystiedot page is not, so it loads lazily like the card images.
  markEagerImage(document.querySelector(".hero__visual img, .page-hero__image img"));
  const inquiryImage = document.getElementById("inquiry-image");
  if (inquiryImage) {
    markLazyImage(inquiryImage);
  }

  updateAdminChrome();
  clearSiteLoadingState();
};

const setupEditorEvents = () => {
  document.addEventListener("click", async (event) => {
    const ownerAccess = event.target.closest(".owner-access");
    if (ownerAccess) {
      event.preventDefault();
      openLoginModal();
      return;
    }

    const adminAction = event.target.closest("[data-admin-action]");
    if (adminAction) {
      const action = adminAction.dataset.adminAction;

      if (action === "publish") {
        await publishChanges();
      }

      if (action === "restore-draft") {
        await restoreServerDraft();
      }

      if (action === "reset") {
        await resetBrowserEdits();
      }

      if (action === "logout") {
        try {
          await fetch("/api/logout", { method: "POST" });
        } catch (error) {
          // Sign-out still proceeds locally even if the API call fails.
        }
        state.isAdmin = false;
        closeModal();
        updateAdminChrome();
      }

      return;
    }

    if (!state.isAdmin) {
      return;
    }

    const editable = event.target.closest(".editable-target");
    if (editable && editable.__editMeta) {
      event.preventDefault();
      openEditor(editable.__editMeta);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
      return;
    }

    if (!state.isAdmin || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    // Don't hijack typing inside the editor's own inputs.
    if (event.target.closest("input, textarea, select, .editor-modal")) {
      return;
    }

    const editable = event.target.closest?.(".editable-target");
    if (editable && editable.__editMeta) {
      event.preventDefault();
      openEditor(editable.__editMeta);
    }
  });
};

const boot = async () => {
  setupParallaxBackground();
  setupHeaderScrollState();
  setupMenu();
  markActiveNav();
  setupEditorEvents();
  setupPublicForms();
  siteLoadingFallbackTimer = setTimeout(clearSiteLoadingState, 1500);

  try {
    state.data = await loadSite();
    state.isAdmin = await checkSession();
    renderPage();
  } catch (error) {
    console.error(error);
    clearSiteLoadingState();
  }
};

boot();

// A page restored from the back/forward cache keeps its frozen JS state and
// never re-runs boot(), so a visitor returning after Marjo publishes new
// content would otherwise keep seeing whatever was loaded before. Force a
// real reload in that case so the fresh content/site.json is fetched.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});
