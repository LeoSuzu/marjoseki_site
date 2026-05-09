const currentPage = document.body.dataset.page;

const STORAGE_KEY = "marjo-site-content-v2";
const AUTH_KEY = "marjo-site-admin-auth-v1";
const ADMIN_EMAIL = "marjoseki@hotmail.com";
const ADMIN_PASSWORD_HASH =
  "08a3d2dc7693d7166eef51ec0194ae6009c7636af128d4a208a14d1b5293c3cd";

const state = {
  data: null,
  isAdmin: sessionStorage.getItem(AUTH_KEY) === "1",
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

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

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const saveToBrowser = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  updateAdminMessage("Saved to this browser.");
};

const resetBrowserEdits = async () => {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(AUTH_KEY);
  state.isAdmin = false;
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
  updateAdminMessage("Backup downloaded.");
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

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
      urlInput.placeholder = "Paste image URL or keep current";
      wrap.append(urlInput);

      const upload = document.createElement("input");
      upload.type = "file";
      upload.accept = "image/*";
      wrap.append(upload);

      if (field.value) {
        const preview = document.createElement("img");
        preview.className = "editor-field__preview";
        preview.src = field.value;
        preview.alt = "Preview";
        wrap.append(preview);
      }

      refs[field.name] = { urlInput, upload };
    } else {
      const input = document.createElement("input");
      input.type = field.type === "password" ? "password" : "text";
      input.value = field.value || "";
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
  cancelButton.textContent = "Cancel";
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

    const values = {};
    for (const field of fields) {
      if (field.type === "checkbox") {
        values[field.name] = refs[field.name].checked;
      } else if (field.type === "image") {
        const { urlInput, upload } = refs[field.name];
        values[field.name] = upload.files[0]
          ? await fileToDataUrl(upload.files[0])
          : urlInput.value.trim();
      } else {
        values[field.name] = refs[field.name].value.trim();
      }
    }

    const shouldClose = await onSubmit(values);
    if (shouldClose !== false) {
      closeModal();
    }
  });
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
    title: meta.title || "Edit text",
    description: "Change the text and save. The page refreshes immediately.",
    submitLabel: "Save text",
    fields: [
      {
        name: "value",
        label: "Text",
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
    title: meta.title || "Edit image",
    description: "Paste an image URL or upload a new image from this computer.",
    submitLabel: "Save image",
    fields: [
      {
        name: "image",
        label: "Image",
        type: "image",
        value: getByPath(state.data, meta.path) || "",
      },
      {
        name: "alt",
        label: "Image description",
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
    title: meta.title || "Edit section",
    description: meta.description || "Update the details and save them back to the page.",
    submitLabel: "Save changes",
    fields: schema.map((field) => ({
      ...field,
      value: current[field.name],
    })),
    dangerAction:
      typeof meta.index === "number" && meta.listPath
        ? {
            label: "Delete item",
            onClick: () => {
              removeFromList(state.data, meta.listPath, meta.index);
              saveToBrowser();
              renderPage();
            },
          }
        : null,
    onSubmit: async (values) => {
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
      { name: "label", label: "Link label", type: "text" },
      { name: "url", label: "Link URL", type: "text" },
      { name: "external", label: "Open in new tab", type: "checkbox" },
    ]);
    return;
  }

  if (meta.kind === "feature" || meta.kind === "service") {
    openObjectEditor(meta, [
      { name: "title", label: "Title", type: "text" },
      { name: "text", label: "Text", type: "textarea" },
    ]);
    return;
  }

  if (meta.kind === "contact") {
    openObjectEditor(meta, [
      { name: "label", label: "Field name", type: "text" },
      { name: "value", label: "Field value", type: "text" },
    ]);
    return;
  }

  if (meta.kind === "event") {
    openObjectEditor(meta, [
      { name: "title", label: "Event title", type: "text" },
      { name: "date", label: "Date", type: "text" },
      { name: "location", label: "Location", type: "text" },
      { name: "text", label: "Description", type: "textarea" },
      { name: "buttonLabel", label: "Button text", type: "text" },
      { name: "buttonUrl", label: "Button link", type: "text" },
    ]);
    return;
  }

  if (meta.kind === "social") {
    openObjectEditor(meta, [
      { name: "title", label: "Title", type: "text" },
      { name: "note", label: "Text", type: "textarea" },
      {
        name: "embedUrl",
        label: "Embed URL",
        type: "text",
      },
    ]);
    return;
  }

  if (meta.kind === "product") {
    openObjectEditor(meta, [
      { name: "title", label: "Title", type: "text" },
      {
        name: "type",
        label: "Type",
        type: "select",
        options: ["Book", "Course", "Workshop", "Other"],
      },
      { name: "format", label: "Format", type: "text" },
      { name: "text", label: "Description", type: "textarea" },
      { name: "priceLabel", label: "Price or note", type: "text" },
      { name: "buyLabel", label: "Main button text", type: "text" },
      { name: "buyUrl", label: "Main button link", type: "text" },
      { name: "infoLabel", label: "Secondary button text", type: "text" },
      { name: "infoUrl", label: "Secondary button link", type: "text" },
      { name: "image", label: "Product image", type: "image" },
      { name: "imageAlt", label: "Image description", type: "text" },
    ]);
  }
};

const hashText = async (value) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const openLoginModal = () => {
  showModal({
    title: "Sign in to edit",
    description:
      "This local visual editor lets Marjo click directly on texts and images. For a public production site, the final authentication should be moved to a proper CMS or host integration.",
    submitLabel: "Sign in",
    fields: [
      { name: "email", label: "Email", type: "text", value: "" },
      { name: "password", label: "Password", type: "password", value: "" },
    ],
    onSubmit: async (values) => {
      const passwordHash = await hashText(values.password);
      if (values.email.toLowerCase() !== ADMIN_EMAIL || passwordHash !== ADMIN_PASSWORD_HASH) {
        window.alert("Login failed. Check the email or password.");
        return false;
      }

      state.isAdmin = true;
      sessionStorage.setItem(AUTH_KEY, "1");
      renderPage();
      updateAdminChrome();
      updateAdminMessage("Edit mode enabled.");
    },
  });
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
      title: `Edit ${link.label} link`,
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
    title: "Edit home hero kicker",
  });
  text("home-hero-title", home.hero.title, {
    kind: "text",
    path: "site.home.hero.title",
    title: "Edit home hero title",
  });
  text("home-hero-text", home.hero.text, {
    kind: "text",
    path: "site.home.hero.text",
    title: "Edit home hero intro",
    rows: 6,
  });
  text("home-primary-cta", home.hero.primaryCtaLabel, {
    kind: "text",
    path: "site.home.hero.primaryCtaLabel",
    title: "Edit main button text",
  });
  text("home-secondary-cta", home.hero.secondaryCtaLabel, {
    kind: "text",
    path: "site.home.hero.secondaryCtaLabel",
    title: "Edit secondary button text",
  });
  setImage("home-hero-image", home.hero.image, home.hero.imageAlt, {
    kind: "image",
    path: "site.home.hero.image",
    altPath: "site.home.hero.imageAlt",
    title: "Edit home hero image",
  });
  text("home-hero-badge", home.hero.badge, {
    kind: "text",
    path: "site.home.hero.badge",
    title: "Edit home badge text",
  });
  text("home-intro-title", home.intro.title, {
    kind: "text",
    path: "site.home.intro.title",
    title: "Edit intro title",
  });
  text("home-intro-text", home.intro.text, {
    kind: "text",
    path: "site.home.intro.text",
    title: "Edit intro text",
    rows: 6,
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
          title: `Edit highlight ${index + 1}`,
        }),
      );
    });
  }
};

const renderInfo = (info, site) => {
  text("info-title", info.title, {
    kind: "text",
    path: "site.info.title",
    title: "Edit information page title",
  });
  text("info-lead", info.lead, {
    kind: "text",
    path: "site.info.lead",
    title: "Edit information page intro",
    rows: 5,
  });
  setImage("info-image", info.image, info.imageAlt, {
    kind: "image",
    path: "site.info.image",
    altPath: "site.info.imageAlt",
    title: "Edit information page image",
  });
  text("info-bio-title", info.bioTitle, {
    kind: "text",
    path: "site.info.bioTitle",
    title: "Edit biography title",
  });
  text("info-bio-text", info.bioText, {
    kind: "text",
    path: "site.info.bioText",
    title: "Edit biography text",
    rows: 8,
  });

  const contactList = document.getElementById("contact-list");
  if (contactList) {
    contactList.innerHTML = "";
    info.contactItems.forEach((item, index) => {
      const block = document.createElement("div");
      block.className = "contact-item";
      registerEditable(block, {
        kind: "contact",
        path: `site.info.contactItems.${index}`,
        listPath: "site.info.contactItems",
        index,
        title: `Edit contact item ${index + 1}`,
      });
      const heading = document.createElement("strong");
      heading.textContent = item.label;
      const paragraph = document.createElement("p");
      paragraph.textContent = item.value;
      block.append(heading, paragraph);
      contactList.append(block);
    });
  }

  const services = document.getElementById("services-grid");
  if (services) {
    services.innerHTML = "";
    info.services.forEach((service, index) => {
      services.append(
        createCard(service.title, service.text, {
          kind: "service",
          path: `site.info.services.${index}`,
          listPath: "site.info.services",
          index,
          title: `Edit service ${index + 1}`,
        }),
      );
    });
  }

  document.title = `${site.siteName} | Information`;
};

const createEventCard = (event, meta) => {
  const article = document.createElement("article");
  article.className = "event-card";
  registerEditable(article, meta);

  const metaRow = document.createElement("div");
  metaRow.className = "event-card__meta";
  [event.date, event.location].filter(Boolean).forEach((value) => {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = value;
    metaRow.append(pill);
  });

  const heading = document.createElement("h3");
  heading.textContent = event.title;

  const paragraph = document.createElement("p");
  paragraph.textContent = event.text;
  article.append(metaRow, heading, paragraph);

  if (event.buttonLabel && event.buttonUrl) {
    const link = document.createElement("a");
    link.className = "button button--secondary";
    link.href = event.buttonUrl;
    link.textContent = event.buttonLabel;
    article.append(link);
  }

  return article;
};

const renderEvents = (events, site) => {
  text("events-title", events.title, {
    kind: "text",
    path: "site.events.title",
    title: "Edit events page title",
  });
  text("events-lead", events.lead, {
    kind: "text",
    path: "site.events.lead",
    title: "Edit events intro",
    rows: 5,
  });
  setImage("events-image", events.image, events.imageAlt, {
    kind: "image",
    path: "site.events.image",
    altPath: "site.events.imageAlt",
    title: "Edit events page image",
  });
  text("social-title", events.social.title, {
    kind: "text",
    path: "site.events.social.title",
    title: "Edit social section title",
  });
  text("social-note", events.social.note, {
    kind: "text",
    path: "site.events.social.note",
    title: "Edit social section text",
    rows: 5,
  });

  const list = document.getElementById("events-list");
  if (list) {
    list.innerHTML = "";
    events.upcoming.forEach((event, index) => {
      list.append(
        createEventCard(event, {
          kind: "event",
          path: `site.events.upcoming.${index}`,
          listPath: "site.events.upcoming",
          index,
          title: `Edit upcoming event ${index + 1}`,
        }),
      );
    });
  }

  const pastList = document.getElementById("past-events-list");
  if (pastList) {
    pastList.innerHTML = "";
    events.past.forEach((event, index) => {
      pastList.append(
        createEventCard(event, {
          kind: "event",
          path: `site.events.past.${index}`,
          listPath: "site.events.past",
          index,
          title: `Edit past event ${index + 1}`,
        }),
      );
    });
  }

  const embed = document.getElementById("social-embed");
  if (embed) {
    embed.innerHTML = "";
    registerEditable(embed, {
      kind: "social",
      path: "site.events.social",
      title: "Edit social highlight block",
    });

    if (events.social.embedUrl) {
      const iframe = document.createElement("iframe");
      iframe.src = events.social.embedUrl;
      iframe.loading = "lazy";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      embed.append(iframe);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "social-placeholder";
      placeholder.textContent = "Add an embeddable social or video link to show it here.";
      embed.append(placeholder);
    }

    if (state.isAdmin) {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "social-edit-chip";
      editButton.textContent = "Edit social block";
      embed.append(editButton);
    }
  }

  document.title = `${site.siteName} | Events`;
};

const renderStore = (store, site) => {
  text("store-title", store.title, {
    kind: "text",
    path: "store.title",
    title: "Edit books and courses title",
  });
  text("store-lead", store.lead, {
    kind: "text",
    path: "store.lead",
    title: "Edit books and courses intro",
    rows: 5,
  });

  const grid = document.getElementById("store-grid");
  if (grid) {
    grid.innerHTML = "";
    store.products.forEach((product, index) => {
      const article = document.createElement("article");
      article.className = "store-card";
      registerEditable(article, {
        kind: "product",
        path: `store.products.${index}`,
        listPath: "store.products",
        index,
        title: `Edit offering ${index + 1}`,
      });

      const image = document.createElement("img");
      image.src = product.image;
      image.alt = product.imageAlt || product.title;

      const meta = document.createElement("div");
      meta.className = "store-card__meta";
      [product.type, product.format].filter(Boolean).forEach((value) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = value;
        meta.append(pill);
      });

      const heading = document.createElement("h3");
      heading.textContent = product.title;

      const paragraph = document.createElement("p");
      paragraph.textContent = product.text;

      const price = document.createElement("p");
      price.className = "price";
      price.textContent = product.priceLabel;

      const actions = document.createElement("div");
      actions.className = "store-card__actions";

      if (product.buyUrl) {
        const buy = document.createElement("a");
        buy.className = "button";
        buy.href = product.buyUrl;
        buy.textContent = product.buyLabel || "Contact";
        actions.append(buy);
      }

      if (product.infoUrl) {
        const more = document.createElement("a");
        more.className = "button button--secondary";
        more.href = product.infoUrl;
        more.textContent = product.infoLabel || "Learn more";
        actions.append(more);
      }

      article.append(image, meta, heading, paragraph, price, actions);
      grid.append(article);
    });
  }

  document.title = `${site.siteName} | Books & Courses`;
};

const renderGlobal = (data) => {
  text("brand-name", data.siteName, {
    kind: "text",
    path: "site.global.siteName",
    title: "Edit site name",
  });
  text("brand-eyebrow", data.brandLine, {
    kind: "text",
    path: "site.global.brandLine",
    title: "Edit brand line",
  });
  text("footer-name", data.siteName, {
    kind: "text",
    path: "site.global.siteName",
    title: "Edit site name",
  });
  text("footer-tagline", data.footerTagline, {
    kind: "text",
    path: "site.global.footerTagline",
    title: "Edit footer tagline",
    rows: 4,
  });
  createFooterLinks(data.footerLinks);
};

const loadSite = async () => {
  const [siteResponse, storeResponse] = await Promise.all([
    fetch("content/site.json"),
    fetch("content/store.json"),
  ]);

  if (!siteResponse.ok || !storeResponse.ok) {
    throw new Error("Failed to load content files.");
  }

  const fallback = {
    site: await siteResponse.json(),
    store: await storeResponse.json(),
  };

  const localCopy = localStorage.getItem(STORAGE_KEY);
  if (!localCopy) {
    return fallback;
  }

  try {
    return JSON.parse(localCopy);
  } catch (error) {
    console.error("Failed to parse local saved content.", error);
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
        <strong>Visual Editor</strong>
        <span data-admin-message>Sign in to edit texts and images directly on the page.</span>
      </div>
      <div class="admin-bar__actions">
        <button type="button" class="button button--ghost" data-admin-action="toggle-login">Sign in</button>
        <button type="button" class="button button--ghost" data-admin-action="save">Save to browser</button>
        <button type="button" class="button button--ghost" data-admin-action="download">Download backup</button>
        <button type="button" class="button button--ghost" data-admin-action="upload">Upload backup</button>
        <button type="button" class="button button--ghost" data-admin-action="reset">Reset edits</button>
        <button type="button" class="button button--ghost" data-admin-action="logout">Log out</button>
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
      label: "Add highlight",
      onClick: () =>
        addListItem("site.home.features", {
          title: "New highlight",
          text: "Click this card to edit the text.",
        }),
    });
  }

  if (currentPage === "info") {
    actions.push({
      label: "Add contact item",
      onClick: () =>
        addListItem("site.info.contactItems", {
          label: "New item",
          value: "Add a value",
        }),
    });
    actions.push({
      label: "Add service",
      onClick: () =>
        addListItem("site.info.services", {
          title: "New service",
          text: "Describe this service here.",
        }),
    });
  }

  if (currentPage === "events") {
    actions.push({
      label: "Add upcoming event",
      onClick: () =>
        addListItem("site.events.upcoming", {
          title: "New upcoming event",
          date: "Add date",
          location: "Add location",
          text: "Describe the event here.",
          buttonLabel: "Ask for details",
          buttonUrl: "mailto:marjoseki@hotmail.com?subject=Event%20Question",
        }),
    });
    actions.push({
      label: "Add past event",
      onClick: () =>
        addListItem("site.events.past", {
          title: "New past event",
          date: "Add date",
          location: "Add location",
          text: "Describe the event here.",
          buttonLabel: "",
          buttonUrl: "",
        }),
    });
  }

  if (currentPage === "store") {
    actions.push({
      label: "Add offering",
      onClick: () =>
        addListItem("store.products", {
          title: "New offering",
          type: "Other",
          format: "Format",
          text: "Describe the item here.",
          priceLabel: "Ask for details",
          buyLabel: "Contact",
          buyUrl: "mailto:marjoseki@hotmail.com?subject=New%20Offering",
          infoLabel: "More information",
          infoUrl: "mailto:marjoseki@hotmail.com?subject=New%20Offering%20Details",
          image: "assets/uploads/books-placeholder.svg",
          imageAlt: "New offering image",
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

  document.body.classList.toggle("admin-mode", state.isAdmin);

  const actions = document.querySelector(".admin-bar__actions");
  const pageActions = document.querySelector("[data-page-actions]");
  const signInButton = document.querySelector('[data-admin-action="toggle-login"]');

  if (!actions || !pageActions || !signInButton) {
    return;
  }

  signInButton.textContent = state.isAdmin ? "Editing enabled" : "Sign in";
  signInButton.disabled = state.isAdmin;

  actions.querySelectorAll("button").forEach((button) => {
    if (button.dataset.adminAction !== "toggle-login") {
      button.style.display = state.isAdmin ? "inline-flex" : "none";
    }
  });

  pageActions.innerHTML = "";
  if (state.isAdmin) {
    createPageActionButtons().forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button--secondary";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      pageActions.append(button);
    });
  }
};

const renderPage = () => {
  renderGlobal(state.data.site.global);

  if (currentPage === "home") {
    renderHome(state.data.site.home);
  }

  if (currentPage === "info") {
    renderInfo(state.data.site.info, state.data.site.global);
  }

  if (currentPage === "events") {
    renderEvents(state.data.site.events, state.data.site.global);
  }

  if (currentPage === "store") {
    renderStore(state.data.store, state.data.site.global);
  }

  updateAdminChrome();
};

const setupEditorEvents = () => {
  document.addEventListener("click", async (event) => {
    const adminTrigger = event.target.closest(".admin-trigger");
    if (adminTrigger) {
      event.preventDefault();
      openLoginModal();
      return;
    }

    const adminAction = event.target.closest("[data-admin-action]");
    if (adminAction) {
      const action = adminAction.dataset.adminAction;

      if (action === "toggle-login") {
        openLoginModal();
      }

      if (action === "save") {
        saveToBrowser();
      }

      if (action === "download") {
        downloadBackup();
      }

      if (action === "upload") {
        document.querySelector("[data-upload-input]")?.click();
      }

      if (action === "reset") {
        await resetBrowserEdits();
      }

      if (action === "logout") {
        sessionStorage.removeItem(AUTH_KEY);
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
      updateAdminMessage("Backup imported.");
    } catch (error) {
      console.error(error);
      updateAdminMessage("Import failed. Check the backup file.");
    } finally {
      input.value = "";
    }
  });
};

const boot = async () => {
  setupMenu();
  markActiveNav();
  setupEditorEvents();

  try {
    state.data = await loadSite();
    renderPage();
  } catch (error) {
    console.error(error);
  }
};

boot();
