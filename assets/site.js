const currentPage = document.body.dataset.page;

const STORAGE_KEY = "marjo-site-content-v3";

const state = {
  data: null,
  isAdmin: false,
};

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

const setImage = (id, src, alt, meta) => {
  const node = document.getElementById(id);
  if (!node) {
    return;
  }

  node.src = src || "";
  node.alt = alt || "";
  if (meta) {
    registerEditable(node, meta);
  }
};

const registerEditable = (node, meta) => {
  node.classList.add("editable-target");
  node.__editMeta = meta;
};

const saveToBrowser = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
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

const downloadBackup = () => {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "marjo-site-backup.json";
  anchor.click();
  URL.revokeObjectURL(url);
  updateAdminMessage("Varmuuskopio ladattu.");
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
        preview.className = "editor-field__preview";
        preview.src = field.value;
        preview.alt = "Esikatselu";
        wrap.append(preview);
      }

      refs[field.name] = { urlInput, upload };
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
      dangerAction.onClick();
      closeModal();
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

const openImageEditor = (meta) => {
  showModal({
    title: meta.title || "Muokkaa kuvaa",
    description: "Liitä kuvan osoite tai lataa uusi kuva tältä koneelta.",
    submitLabel: "Tallenna kuva",
    fields: [
      {
        name: "image",
        label: "Kuva",
        type: "image",
        value: getByPath(state.data, meta.path) || "",
      },
      {
        name: "alt",
        label: "Kuvan kuvaus",
        type: "text",
        value: getByPath(state.data, meta.altPath) || "",
      },
    ],
    onSubmit: async (values) => {
      setByPath(state.data, meta.path, values.image);
      setByPath(state.data, meta.altPath, values.alt);
      saveToBrowser();
      renderPage();
    },
  });
};

const openObjectEditor = (meta, schema) => {
  const current = getByPath(state.data, meta.path);
  showModal({
    title: meta.title || "Muokkaa osiota",
    description: meta.description || "Päivitä tiedot ja tallenna ne sivulle.",
    submitLabel: "Tallenna muutokset",
    fields: schema.map((field) => ({
      ...field,
      value: current[field.name],
    })),
    dangerAction:
      typeof meta.index === "number" && meta.listPath
        ? {
            label: "Poista kohde",
            onClick: () => {
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
      setByPath(state.data, meta.path, values);
      saveToBrowser();
      renderPage();
    },
  });
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
      { name: "image", label: "Kuva", type: "image" },
      { name: "imageAlt", label: "Kuvan kuvaus", type: "text" },
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

  if (meta.kind === "social") {
    openObjectEditor(meta, [
      { name: "title", label: "Otsikko", type: "text" },
      { name: "note", label: "Teksti", type: "textarea" },
      { name: "facebookUrl", label: "Facebook-osoite", type: "text" },
      { name: "instagramUrl", label: "Instagram-osoite", type: "text" },
    ]);
    return;
  }

  if (meta.kind === "book") {
    openObjectEditor(meta, [
      { name: "title", label: "Kirjan nimi", type: "text" },
      { name: "status", label: "Tila", type: "select", options: ["Myynnissä", "Loppuunmyyty", "Tulossa"] },
      { name: "text", label: "Kuvaus", type: "textarea" },
      { name: "image", label: "Kansikuva", type: "image" },
      { name: "imageAlt", label: "Kuvan kuvaus", type: "text" },
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
      { name: "image", label: "Kurssin kuva", type: "image" },
      { name: "imageAlt", label: "Kuvan kuvaus", type: "text" },
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
    }
  });
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
      image.src = item.image;
      image.alt = item.imageAlt || "";
      figure.append(image);
      gallery.append(figure);
    });
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
      image.src = course.image;
      image.alt = course.imageAlt || course.title;

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

      article.append(image, meta, heading, paragraph, price, actions);
      grid.append(article);
    });
  }

  document.title = `${site.siteName} | Palvelut`;
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
  image.src = book.image;
  image.alt = book.imageAlt || book.title;
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
  }

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

  document.title = `${site.siteName} | Kirjat`;
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

  document.title = `${site.siteName} | Yhteystiedot`;
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

  const simpleDate = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
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

const buildFacebookEmbedUrl = (postUrl) => {
  if (!postUrl) {
    return null;
  }
  const trimmed = postUrl.trim();
  if (!/^https:\/\/(www\.)?(facebook\.com|fb\.watch)\//i.test(trimmed)) {
    return null;
  }
  const params = new URLSearchParams({
    href: trimmed,
    show_text: "true",
    width: "500",
  });
  return `https://www.facebook.com/plugins/post.php?${params.toString()}`;
};

const buildInstagramEmbedUrl = (postUrl) => {
  if (!postUrl) {
    return null;
  }
  const trimmed = postUrl.trim();
  if (!/^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\//i.test(trimmed)) {
    return null;
  }
  return `${trimmed.replace(/\/?(\?.*)?$/, "")}/embed`;
};

const createSocialEmbedCard = ({ label, url, embedUrl, themeClass }) => {
  const article = document.createElement("article");
  article.className = `social-embed-card ${themeClass || ""}`.trim();

  const heading = document.createElement("h3");
  heading.textContent = label;

  const copy = document.createElement("p");
  copy.textContent = embedUrl
    ? "Tuoreimmat julkaisut näkyvät suoraan täällä."
    : url
      ? "Voit päivittää tämän kortin suoraan sosiaalisen median upotussisällöllä tai pitää nykyisen linkin."
      : "Lisää upotuskoodi tai URL-osoite, niin sisältö näkyy täällä suoraan.";

  article.append(heading, copy);

  if (embedUrl) {
    const frame = document.createElement("iframe");
    frame.className = "social-embed-card__frame";
    frame.src = embedUrl;
    frame.title = `${label} -upotus`;
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allow = "fullscreen";
    article.append(frame);
  }

  if (url) {
    const link = document.createElement("a");
    link.className = "button button--secondary";
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `Avaa ${label}`;
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
  text("social-title", tapahtumia.social.title, {
    kind: "text",
    path: "site.tapahtumia.social.title",
    title: "Muokkaa sosiaalisen median otsikkoa",
  });
  text("social-note", tapahtumia.social.note, {
    kind: "text",
    path: "site.tapahtumia.social.note",
    title: "Muokkaa sosiaalisen median tekstiä",
    rows: 5,
  });

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
    .sort((left, right) => compareEventDates(left.event, right.event))
    .slice(0, 4);

  const list = document.getElementById("events-list");
  if (list) {
    list.innerHTML = "";

    if (upcomingEvents.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Ei tulevia tapahtumia juuri nyt.";
      list.append(empty);
    } else {
      upcomingEvents.forEach(({ event, meta }) => {
        list.append(createEventCard(event, meta));
      });
    }
  }

  const pastList = document.getElementById("past-events-list");
  if (pastList) {
    pastList.innerHTML = "";

    if (recentEntries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Ei vielä viimeaikaisia hetkiä.";
      pastList.append(empty);
    } else {
      recentEntries.forEach(({ event, meta }) => {
        pastList.append(createEventCard(event, meta, true));
      });
    }
  }

  const embeds = document.getElementById("social-embeds");
  if (embeds) {
    embeds.innerHTML = "";
    registerEditable(embeds, {
      kind: "social",
      path: "site.tapahtumia.social",
      title: "Muokkaa sosiaalisen median linkkejä",
    });

    if (tapahtumia.social.facebookUrl || tapahtumia.social.facebookEmbedUrl) {
      embeds.append(
        createSocialEmbedCard({
          label: "Facebook",
          url: tapahtumia.social.facebookUrl,
          embedUrl: buildFacebookEmbedUrl(tapahtumia.social.facebookEmbedUrl),
          themeClass: "social-embed-card--facebook",
        }),
      );
    }

    if (tapahtumia.social.instagramUrl || tapahtumia.social.instagramEmbedUrl) {
      embeds.append(
        createSocialEmbedCard({
          label: "Instagram",
          url: tapahtumia.social.instagramUrl,
          embedUrl:
            buildInstagramEmbedUrl(tapahtumia.social.instagramEmbedUrl) ||
            tapahtumia.social.instagramEmbedUrl,
          themeClass: "social-embed-card--instagram",
        }),
      );
    }
  }

  document.title = `${site.siteName} | Tapahtumia`;
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
  const siteResponse = await fetch("content/site.json");

  if (!siteResponse.ok) {
    throw new Error("Sisältötiedoston lataus epäonnistui.");
  }

  const fallback = { site: await siteResponse.json() };

  const localCopy = localStorage.getItem(STORAGE_KEY);
  if (!localCopy) {
    return fallback;
  }

  try {
    return JSON.parse(localCopy);
  } catch (error) {
    console.error("Tallennetun sisällön jäsentäminen epäonnistui.", error);
    return fallback;
  }
};

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
        <button type="button" class="button button--ghost" data-admin-action="download">Lataa varmuuskopio</button>
        <button type="button" class="button button--ghost" data-admin-action="upload">Tuo varmuuskopio</button>
        <button type="button" class="button button--ghost" data-admin-action="restore-draft">Hae palvelimen luonnos</button>
        <button type="button" class="button button--ghost" data-admin-action="reset">Nollaa muutokset</button>
        <button type="button" class="button button--ghost" data-admin-action="logout">Kirjaudu ulos</button>
      </div>
      <div class="admin-bar__page-actions" data-page-actions></div>
      <input type="file" accept="application/json" hidden data-upload-input />
    </div>
  `;
  document.body.append(bar);
};

const addListItem = (path, item) => {
  const list = getByPath(state.data, path);
  list.push(item);
  saveToBrowser();
  renderPage();
};

const createPageActionButtons = () => {
  const actions = [];

  if (currentPage === "home") {
    actions.push({
      label: "Lisää kohokohta",
      onClick: () =>
        addListItem("site.home.features", {
          title: "Uusi kohokohta",
          text: "Klikkaa tätä korttia muokataksesi tekstiä.",
        }),
    });
    actions.push({
      label: "Lisää kuva galleriaan",
      onClick: () =>
        addListItem("site.home.gallery.images", {
          image: "assets/uploads/portrait-placeholder.svg",
          imageAlt: "Uusi kuva",
        }),
    });
  }

  if (currentPage === "yhteystiedot") {
    actions.push({
      label: "Lisää yhteystieto",
      onClick: () =>
        addListItem("site.yhteystiedot.contactItems", {
          label: "Uusi kenttä",
          value: "Lisää arvo",
        }),
    });
  }

  if (currentPage === "tapahtumia") {
    actions.push({
      label: "Lisää tuleva tapahtuma",
      onClick: () =>
        addListItem("site.tapahtumia.upcoming", {
          title: "Uusi tuleva tapahtuma",
          date: "",
          dateEnd: "",
          location: "",
          text: "Kuvaile tapahtuma tässä.",
          buttonLabel: "Kysy lisää",
          buttonUrl: "mailto:marjoseki@hotmail.com?subject=Tapahtumakysymys",
        }),
    });
    actions.push({
      label: "Lisää mennyt tapahtuma",
      onClick: () =>
        addListItem("site.tapahtumia.past", {
          title: "Uusi mennyt tapahtuma",
          date: "",
          dateEnd: "",
          location: "",
          text: "Kuvaile tapahtuma tässä.",
          buttonLabel: "",
          buttonUrl: "",
        }),
    });
  }

  if (currentPage === "palvelut") {
    actions.push({
      label: "Lisää kurssi",
      onClick: () =>
        addListItem("site.palvelut.courses", {
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
        }),
    });
  }

  if (currentPage === "kirjat") {
    actions.push({
      label: "Lisää kirja",
      onClick: () =>
        addListItem("site.kirjat.books", {
          title: "Uusi kirja",
          status: "Tulossa",
          text: "Kuvaile kirja tässä.",
          image: "assets/uploads/books-placeholder.svg",
          imageAlt: "Uuden kirjan kansi",
        }),
    });
  }

  return actions;
};

const updateAdminChrome = () => {
  if (!state.isAdmin) {
    document.body.classList.remove("admin-mode");
    document.querySelector(".admin-bar")?.remove();
    return;
  }

  createAdminChrome();
  document.body.classList.add("admin-mode");

  const pageActions = document.querySelector("[data-page-actions]");
  if (!pageActions) {
    return;
  }

  pageActions.innerHTML = "";
  createPageActionButtons().forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--secondary";
    button.textContent = action.label;
    button.addEventListener("click", action.onClick);
    pageActions.append(button);
  });
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

  updateAdminChrome();
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

      if (action === "download") {
        downloadBackup();
      }

      if (action === "upload") {
        document.querySelector("[data-upload-input]")?.click();
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

  document.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-upload-input]");
    if (!input || !input.files[0]) {
      return;
    }

    try {
      const textValue = await input.files[0].text();
      state.data = JSON.parse(textValue);
      saveToBrowser();
      renderPage();
      updateAdminMessage("Varmuuskopio tuotu.");
    } catch (error) {
      console.error(error);
      updateAdminMessage("Tuonti epäonnistui. Tarkista varmuuskopiotiedosto.");
    } finally {
      input.value = "";
    }
  });
};

const boot = async () => {
  setupMenu();
  markActiveNav();
  setupEditorEvents();
  setupPublicForms();

  try {
    state.data = await loadSite();
    state.isAdmin = await checkSession();
    renderPage();
  } catch (error) {
    console.error(error);
  }
};

boot();
