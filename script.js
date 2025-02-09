/****************************************************
 *                IMPORTS & VARIABLES               *
 ****************************************************/
import { 
  supabase, 
  currentUser, 
  checkAuth, 
  handleLogout,
  loadCategories,
  loadItems,
  saveItems,
  addItem,
  updateItem,
  deleteItem,
  categories,
  myList,
  addCategory,
  deleteCategory
} from './supabase.js';

import { showToast, generateUUID } from './utils.js';

/****************************************************
*                LOCAL STORAGE KEYS                *
****************************************************/
const STORAGE_KEY_ITEMS         = "myMiniMAL_items";
const STORAGE_KEY_CATS          = "myMiniMAL_categories";
const STORAGE_KEY_THEME         = "myMiniMAL_darkmode";
const STORAGE_KEY_MINIMAL_VIEW  = "myMiniMAL_minimalView";

/****************************************************
*        WELCOME SCREEN (Ne plus afficher)         *
****************************************************/
const shouldShowWelcome = () => localStorage.getItem("skipWelcome") !== "true";
const setSkipWelcome = () => localStorage.setItem("skipWelcome", "true");

/****************************************************
*              EXPORT DES DONNÉES                  *
****************************************************/
const exportDataToJSON = () => {
const blob = new Blob([JSON.stringify({ myList, categories }, null, 2)], { type: "application/json" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "myMiniMAL_data.json";
a.click();
URL.revokeObjectURL(url);
showToast("Données exportées avec succès.", "success");
};

/****************************************************
*       RECHERCHE, FILTRAGE & TRI DES ITEMS        *
****************************************************/
const filterByType = (type) => {
if (type === "all") return [...myList];
return myList.filter(it => it.type === type);
};

const filterBySearch = (query) => {
const q = query.toLowerCase();
return myList.filter(it => it.title.toLowerCase().includes(q));
};

const calculateProgress = (item) => {
if (item.total > 0) {
  return Math.floor((item.chapter / item.total) * 100);
}
return 0;
};

const calculateDurationDays = (start_date, end_date) => {
if (!start_date || !end_date) return null;
const s = new Date(start_date);
const e = new Date(end_date);
const diff = e.getTime() - s.getTime();
if (diff < 0) return null; 
return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const sortItems = (items, mode) => {
switch (mode) {
  case "title-asc":
    return items.sort((a, b) => a.title.localeCompare(b.title));
  case "score-desc":
    return items.sort((a, b) => (b.score || 0) - (a.score || 0));
  case "fav-first":
    return items.sort((a, b) => (b.is_fav ? 1 : 0) - (a.is_fav ? 1 : 0));
  case "progress-desc":
    return items.sort((a, b) => calculateProgress(b) - calculateProgress(a));
  case "recently-updated":
    return items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  default:
    return items; 
}
};

/****************************************************
*               THEME (DARK/LIGHT)                 *
****************************************************/
const applyTheme = () => {
const isDark = localStorage.getItem(STORAGE_KEY_THEME) === "true";
document.body.classList.toggle("dark-mode", isDark);

const themeBtn = document.getElementById("toggle-theme-btn");
if (!themeBtn) return;

// Mise à jour de l'icône
const themeIcon = themeBtn.querySelector("i");
themeIcon.className = isDark ? "fas fa-sun" : "fas fa-moon";

// Mise à jour du titre (accessibilité)
themeBtn.title = isDark ? "Passer en mode clair" : "Passer en mode sombre";
};

const toggleTheme = () => {
const isDarkNow = document.body.classList.toggle("dark-mode");
localStorage.setItem(STORAGE_KEY_THEME, isDarkNow ? "true" : "false");

const themeBtn = document.getElementById("toggle-theme-btn");
const themeIcon = themeBtn.querySelector("i");
themeIcon.className = isDarkNow ? "fas fa-sun" : "fas fa-moon";
themeBtn.title = isDarkNow ? "Passer en mode clair" : "Passer en mode sombre";

showToast(`Mode ${isDarkNow ? "sombre" : "clair"} activé.`, "info");
};

/****************************************************
*         VUE MINIMALISTE & PLEIN ÉCRAN            *
****************************************************/
let isMinimalView = localStorage.getItem(STORAGE_KEY_MINIMAL_VIEW) === "true";

const applyViewSettings = () => {
const viewBtn = document.getElementById("toggle-minimal-view-btn");
if (!viewBtn) return;

const viewIcon = viewBtn.querySelector("i");
const listSect = document.getElementById("list-section");

if (!listSect) return;

if (isMinimalView) {
  listSect.classList.add("minimalist-view");
  document.querySelectorAll(".flip-card").forEach(card => card.classList.add("minimalist"));
  viewIcon.className = "fas fa-table-list"; // Vue standard
  viewBtn.title = "Passer en vue standard";
} else {
  listSect.classList.remove("minimalist-view");
  document.querySelectorAll(".flip-card").forEach(card => card.classList.remove("minimalist"));
  viewIcon.className = "fas fa-table-cells"; // Vue minimaliste
  viewBtn.title = "Passer en vue minimaliste";
}
};

const toggleMinimalView = () => {
isMinimalView = !isMinimalView;
localStorage.setItem(STORAGE_KEY_MINIMAL_VIEW, isMinimalView);
applyViewSettings();
showToast(`Vue ${isMinimalView ? "minimaliste" : "standard"} activée.`, "info");
};

/****************************************************
*          ELEMENTS DU DOM / INIT GLOBAL           *
****************************************************/
// WELCOME
const welcomeScreen     = document.getElementById("welcome-screen");
const dontShowAgain     = document.getElementById("dont-show-again");
const btnCloseWelcome   = document.getElementById("btn-close-welcome");

// THEME
const toggleThemeBtn    = document.getElementById("toggle-theme-btn");

// ITEM MODAL
const itemModal         = document.getElementById("item-modal");
const modalOverlay      = document.getElementById("modal-overlay");
const closeModalIcon    = document.getElementById("close-modal");
const cancelBtn         = document.getElementById("cancel-btn");
const itemForm          = document.getElementById("item-form");
const itemIdInput       = document.getElementById("item-id");
const itemTypeSelect    = document.getElementById("item-type");
const itemTitleInput    = document.getElementById("item-title");
const itemCoverInput    = document.getElementById("item-cover");
const itemChapInput     = document.getElementById("item-chapter");
const itemTotalInput    = document.getElementById("item-total");
const itemStatusSel     = document.getElementById("item-status");
const itemScoreInput    = document.getElementById("item-score");
const itemUrlInput      = document.getElementById("item-url");
const itemFavCheck      = document.getElementById("item-fav");
const itemNotesArea     = document.getElementById("item-notes");
const itemstart_date    = document.getElementById("item-start-date");
const itemend_date      = document.getElementById("item-end-date");
const itemTagsInput     = document.getElementById("item-tags");
const modalTitle        = document.getElementById("modal-title");
const findCoverBtn      = document.getElementById("find-cover-btn");
const coverPreviewImg   = document.getElementById("cover-preview");

// CATS MODAL
const catModal          = document.getElementById("cat-modal");
const catModalOverlay   = document.getElementById("cat-modal-overlay");
const closeCatModal     = document.getElementById("close-cat-modal");
const catListUl         = document.getElementById("cat-list");
const catInput          = document.getElementById("cat-input");
const addCatBtn         = document.getElementById("add-cat-btn");

// STATS MODAL
const statsModal        = document.getElementById("stats-modal");
const statsModalOverlay = document.getElementById("stats-modal-overlay");
const closeStatsModal   = document.getElementById("close-stats-modal");
const statsTotal        = document.getElementById("stats-total");
const statsAverage      = document.getElementById("stats-average");
const statsChartCat     = document.getElementById("stats-chart-cat");
const statsChartStatus  = document.getElementById("stats-chart-status");
const statsMostAdvanced = document.getElementById("stats-most-advanced");
const statsChartTags    = document.getElementById("stats-chart-tags");
const btnRemoveDuplicates = document.getElementById("btn-remove-duplicates");

// MAIN + FILTRES + TRI
const listSection    = document.getElementById("list-section");
const filterSelect   = document.getElementById("filter-select");
const sortSelect     = document.getElementById("sort-select");

// RECHERCHE
const searchInput    = document.querySelector('.search-container .search-input');
const suggestions    = document.getElementById("suggestions");

// IMPORT/EXPORT
const exportBtn      = document.getElementById("export-btn");
const importFile     = document.getElementById("import-file");

// AUTH
const btnLogin       = document.getElementById('btn-login');
const btnLogout      = document.getElementById('btn-logout');

// AUTOCOMPLETE
const mangaAutocomplete = document.getElementById('manga-autocomplete');
// Aperçu de couverture (celui du champ URL, on l'a déjà : coverPreviewImg)
const coverPreview     = document.getElementById('cover-preview'); // identique si c’est le même <img>

// Autres (optionnels si présents dans le HTML)
const generateUrlBtn   = document.getElementById('generate-url-btn');
const mangaSlugInput   = document.getElementById('manga-slug'); // S’il existe

// Variable pour suivre la sélection actuelle (clic sur une carte)
let selectedCard = null;

/****************************************************
*               FONCTIONS D'INIT GLOBALES          *
****************************************************/
document.addEventListener("DOMContentLoaded", async () => {
// Vérification Auth Supabase
if (!await checkAuth()) return;

try {
  // Charger catégories & items depuis supabase
  await loadCategories();
  await loadItems();

  // Mettre à jour l'UI
  refreshItemTypeSelect();
  populateFilterDropdown();
  renderCatList();

  applyTheme();
  applyViewSettings();

  initWelcome();
  initCategoryManager();
  initItemModal();
  initSearch();
  initStatsModal();

  // BOUTONS
  if (toggleThemeBtn) toggleThemeBtn.addEventListener("click", toggleTheme);
  if (exportBtn)      exportBtn.addEventListener("click", exportDataToJSON);

  if (importFile) {
    importFile.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        importDataFromJSON(e.target.files[0]);
        e.target.value = ""; // reset input file
      }
    });
  }

  if (btnRemoveDuplicates) {
    btnRemoveDuplicates.addEventListener("click", removeDuplicates);
  }

  // Vue Minimaliste
  const minimalViewBtn = document.getElementById("toggle-minimal-view-btn");
  if (minimalViewBtn) {
    minimalViewBtn.addEventListener("click", toggleMinimalView);
  }

  // Sélecteur de tri
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      renderList(getCurrentFilter());
    });
  }

  // Sélecteur de filtre
  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      renderList(filterSelect.value);
    });
  }

  // Bouton "Ajouter un élément"
  const btnOpenModal = document.getElementById("btn-open-modal");
  if (btnOpenModal) {
    btnOpenModal.addEventListener("click", openModalForAdd);
  }

  // Premier rendu de la liste
  renderList(getCurrentFilter());
  initDragAndDrop();

  // Auth
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    if (btnLogin)  btnLogin.classList.add('hidden');
    if (btnLogout) btnLogout.classList.remove('hidden');
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
  } else {
    if (btnLogin)  btnLogin.classList.remove('hidden');
    if (btnLogout) btnLogout.classList.add('hidden');
  }

  // Gestion de la touche Suppr pour supprimer l'item sélectionné
  document.addEventListener('keydown', handleKeyPress);

  // Navigation mobile
  if (window.innerWidth <= 768) {
    initMobileNavigation();
  }

  // Génération d'URL (optionnel, si vous avez ce bouton dans votre HTML)
  if (generateUrlBtn) {
    generateUrlBtn.addEventListener('click', () => {
      if (!mangaSlugInput) {
        showToast('Le champ slug n’existe pas dans votre HTML.', 'warning');
        return;
      }
      const slug = mangaSlugInput.value.trim();
      const cat = itemTypeSelect.value;
      const chapter = parseInt(itemChapInput.value, 10) || 1;

      if (!slug) {
        showToast('Veuillez entrer un slug', 'warning');
        return;
      }
      if (!cat) {
        showToast('Veuillez sélectionner une catégorie', 'warning');
        return;
      }
      const url = createAnimeSamaLink(slug, chapter, cat);
      itemUrlInput.value = url;
      showToast('URL générée avec succès', 'success');
    });
  }

} catch (error) {
  console.error('Erreur lors de l’initialisation :', error);
  showToast('Erreur à l’initialisation de l’application', 'error');
}
});

/****************************************************
*                 WELCOME SCREEN INIT              *
****************************************************/
const initWelcome = () => {
if (shouldShowWelcome() && welcomeScreen) {
  welcomeScreen.classList.remove("hidden");
  welcomeScreen.focus();
}
if (btnCloseWelcome) {
  btnCloseWelcome.addEventListener("click", () => {
    if (dontShowAgain && dontShowAgain.checked) {
      setSkipWelcome();
    }
    if (welcomeScreen) welcomeScreen.classList.add("hidden");
    const topNav = document.querySelector('.top-nav');
    if (topNav) topNav.focus();
  });
}
};

/****************************************************
*               FILTRES DYNAMIQUES                 *
****************************************************/
const populateFilterDropdown = () => {
if (!filterSelect) return;
filterSelect.innerHTML = '<option value="all">Tous</option>';
categories.forEach(cat => {
  const option = document.createElement("option");
  option.value = cat;
  option.textContent = cat;
  filterSelect.appendChild(option);
});
};

/****************************************************
*        GESTION DU MODAL DES CATÉGORIES           *
****************************************************/
const initCategoryManager = () => {
const btnManageCats = document.getElementById("btn-manage-cats");
if (btnManageCats) {
  btnManageCats.addEventListener("click", openCatModal);
}
if (catModalOverlay) {
  catModalOverlay.addEventListener("click", closeCatModalFn);
}
if (closeCatModal) {
  closeCatModal.addEventListener("click", closeCatModalFn);
}
if (addCatBtn) {
  addCatBtn.addEventListener("click", async () => {
    const newCat = catInput.value.trim();
    if (newCat) {
      const result = await addCategory(newCat);
      if (result.error) {
        showToast(result.error, "error");
      } else {
        catInput.value = "";
        refreshItemTypeSelect();
        populateFilterDropdown();
        renderCatList();
        showToast(`Catégorie "${newCat}" ajoutée.`, "success");
      }
    } else {
      showToast("Veuillez entrer un nom de catégorie valide.", "warning");
    }
  });
}
if (catInput) {
  catInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (addCatBtn) addCatBtn.click();
    }
  });
}
};

const openCatModal = () => {
if (catModal) {
  catModal.classList.remove("hidden");
  renderCatList();
  if (catInput) catInput.focus();
}
};
const closeCatModalFn = () => {
if (catModal) catModal.classList.add("hidden");
const btnManageCats = document.getElementById("btn-manage-cats");
if (btnManageCats) btnManageCats.focus();
};

const renderCatList = () => {
if (!catListUl) return;
catListUl.innerHTML = "";
categories.forEach(cat => {
  const li = document.createElement("li");
  const span = document.createElement("span");
  span.textContent = cat;
  li.appendChild(span);

  const delBtn = document.createElement("button");
  delBtn.className = "del-cat-btn";
  delBtn.textContent = "Suppr";
  delBtn.setAttribute("aria-label", `Supprimer la catégorie ${cat}`);
  delBtn.addEventListener("click", async () => {
    const result = await deleteCategory(cat);
    if (result.error) {
      showToast(result.error, result.type);
    } else {
      refreshItemTypeSelect();
      populateFilterDropdown();
      renderCatList();
      showToast(result.message, "success");
    }
  });
  li.appendChild(delBtn);

  catListUl.appendChild(li);
});
};

/****************************************************
*           MODALE AJOUT / ÉDITION D'ITEM          *
****************************************************/
const initItemModal = () => {
if (closeModalIcon) {
  closeModalIcon.addEventListener("click", closeItemModalFn);
}
if (modalOverlay) {
  modalOverlay.addEventListener("click", closeItemModalFn);
}
if (cancelBtn) {
  cancelBtn.addEventListener("click", closeItemModalFn);
}
if (itemForm) {
  itemForm.addEventListener("submit", onFormSubmit);
}
// Fermer la modale avec Échap
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (itemModal && !itemModal.classList.contains("hidden")) {
      closeItemModalFn();
    }
    if (catModal && !catModal.classList.contains("hidden")) {
      closeCatModalFn();
    }
    if (statsModal && !statsModal.classList.contains("hidden")) {
      closeStatsModalFn();
    }
  }
});
};

const refreshItemTypeSelect = () => {
if (!itemTypeSelect) return;
itemTypeSelect.innerHTML = "";
if (categories.length === 0) {
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = "Aucune catégorie";
  itemTypeSelect.appendChild(opt);
  itemTypeSelect.disabled = true;
  return;
}
itemTypeSelect.disabled = false;
categories.forEach(cat => {
  const opt = document.createElement("option");
  opt.value = cat;
  opt.textContent = cat;
  itemTypeSelect.appendChild(opt);
});
};

const openModalForAdd = () => {
if (!itemModal) return;
modalTitle.textContent    = "Ajouter un élément";
itemIdInput.value         = "";
if (categories.length > 0) {
  itemTypeSelect.value    = categories[0];
}
itemTitleInput.value      = "";
itemCoverInput.value      = "";
coverPreviewImg.src       = "";
coverPreviewImg.style.display = "none";
itemChapInput.value       = 0;
itemTotalInput.value      = 0;
itemStatusSel.value       = "en-cours";
itemScoreInput.value      = 0;
itemUrlInput.value        = "";
itemFavCheck.checked      = false;
itemNotesArea.value       = "";
itemstart_date.value      = "";
itemend_date.value        = "";
itemTagsInput.value       = "";
itemModal.classList.remove("hidden");
itemTitleInput.focus();
};

const closeItemModalFn = () => {
if (itemModal) itemModal.classList.add("hidden");
const btnOpenModal = document.getElementById("btn-open-modal");
if (btnOpenModal) btnOpenModal.focus();
};

const openModalForEdit = (item) => {
if (!itemModal) return;
modalTitle.textContent = "Modifier un élément";
itemIdInput.value      = item.id;
itemTypeSelect.value   = item.type;
itemTitleInput.value   = item.title;
itemCoverInput.value   = item.cover || "";
if (item.cover) {
  coverPreviewImg.src       = item.cover;
  coverPreviewImg.style.display = "block";
} else {
  coverPreviewImg.src       = "";
  coverPreviewImg.style.display = "none";
}
itemChapInput.value     = item.chapter;
itemTotalInput.value    = item.total || 0;
itemStatusSel.value     = item.status || "en-cours";
itemScoreInput.value    = item.score || 0;
itemUrlInput.value      = item.url || "";
itemFavCheck.checked    = !!item.is_fav;
itemNotesArea.value     = item.notes || "";
itemstart_date.value    = item.start_date || "";
itemend_date.value      = item.end_date || "";
itemTagsInput.value     = (item.tags || []).join(", ");
itemModal.classList.remove("hidden");
itemTitleInput.focus();
};

const onFormSubmit = async (e) => {
e.preventDefault();
const id          = itemIdInput.value;
const type        = itemTypeSelect.value;
const title       = itemTitleInput.value.trim();
const cover       = itemCoverInput.value.trim();
const chapter     = parseInt(itemChapInput.value, 10) || 0;
const total       = parseInt(itemTotalInput.value, 10) || 0;
const status      = itemStatusSel.value;
const score       = parseFloat(itemScoreInput.value) || 0;
const url         = itemUrlInput.value.trim();
const is_fav      = itemFavCheck.checked;
const notes       = itemNotesArea.value.trim();
const start_date  = itemstart_date.value || null;
const end_date    = itemend_date.value || null;
const tagsRaw     = itemTagsInput.value.trim();
const tags        = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

if (!type || !title) {
  showToast("Catégorie et Titre sont obligatoires.", "warning");
  return;
}

try {
  if (!id) {
    // Ajout
    const newItem = {
      id: generateUUID(),
      type,
      title,
      cover,
      chapter,
      total,
      status,
      score,
      url,
      is_fav,
      notes,
      start_date,
      end_date,
      tags,
      updated_at: new Date().toISOString()
    };
    await addItem(newItem);

  } else {
    // Mise à jour
    const updatedItem = {
      id,
      type,
      title,
      cover,
      chapter,
      total,
      status,
      score,
      url,
      is_fav,
      notes,
      start_date,
      end_date,
      tags,
      updated_at: new Date().toISOString()
    };
    await updateItem(updatedItem);
  }

  closeItemModalFn();
  await loadItems();
  renderList(getCurrentFilter());

} catch (error) {
  console.error('Erreur lors de la soumission:', error);
  showToast('Erreur lors de la sauvegarde', 'error');
}
};

/****************************************************
*        RECHERCHE D'IMAGE (API Jikan) [option]    *
****************************************************/
async function findCoverImage(title) {
const apiUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`;
try {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Erreur réseau: ${response.status}`);
  }
  const data = await response.json();
  if (data.data && data.data.length > 0) {
    return data.data[0].images.jpg.image_url; 
  } else {
    // Aucun anime trouvé, on tente la recherche manga
    const mangaUrl = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=1`;
    const mangaResponse = await fetch(mangaUrl);
    if (!mangaResponse.ok) {
      throw new Error(`Erreur réseau: ${mangaResponse.status}`);
    }
    const mangaData = await mangaResponse.json();
    if (mangaData.data && mangaData.data.length > 0) {
      return mangaData.data[0].images.jpg.image_url;
    } else {
      return null;
    }
  }
} catch (error) {
  console.error("Erreur lors de la recherche de l'image:", error);
  showToast("Erreur lors de la recherche de l'image.", "error");
  return null;
}
}

// Bouton "Trouver l'image"
if (findCoverBtn) {
findCoverBtn.addEventListener("click", async () => {
  const title = (itemTitleInput.value || "").trim();
  if (!title) {
    showToast("Veuillez entrer un titre avant de rechercher une image.", "warning");
    itemTitleInput.focus();
    return;
  }
  findCoverBtn.disabled = true;
  findCoverBtn.textContent = "🔍...";

  const imageUrl = await findCoverImage(title);
  if (imageUrl) {
    itemCoverInput.value = imageUrl;
    coverPreviewImg.src = imageUrl;
    coverPreviewImg.style.display = "block";
    showToast("Image trouvée et ajoutée.", "success");
  } else {
    showToast("Aucune image trouvée pour ce titre.", "warning");
    coverPreviewImg.src = "";
    coverPreviewImg.style.display = "none";
  }

  findCoverBtn.disabled = false;
  findCoverBtn.textContent = "🔍 Image";
});
}

// Aperçu auto si on tape l’URL manuellement
if (itemCoverInput) {
itemCoverInput.addEventListener("input", () => {
  const url = itemCoverInput.value.trim();
  if (url) {
    coverPreviewImg.src = url;
    coverPreviewImg.style.display = "block";
  } else {
    coverPreviewImg.src = "";
    coverPreviewImg.style.display = "none";
  }
});
}

/****************************************************
*             AFFICHAGE & RENDER DES ITEMS         *
****************************************************/
const renderList = (filter = "all") => {
if (!listSection) return;
listSection.innerHTML = "";

let items = filterByType(filter);
const sortMode = sortSelect ? sortSelect.value : "default";
items = sortItems(items, sortMode);

// Appliquer la recherche
const query = (searchInput?.value || "").trim().toLowerCase();
if (query) {
  items = items.filter(it => it.title.toLowerCase().includes(query));
}

if (items.length === 0) {
  const p = document.createElement("p");
  p.className = "empty-message";
  p.textContent = "Aucun élément pour ce filtre.";
  listSection.appendChild(p);
  return;
}

items.forEach(it => {
  const card = createFlipCard(it);
  listSection.appendChild(card);
});

applyViewSettings();
};

const getCurrentFilter = () => {
return (filterSelect && filterSelect.value) ? filterSelect.value : "all";
};

const createFlipCard = (item) => {
const flipCard = document.createElement("div");
flipCard.className = "flip-card fade-in";
if (isMinimalView) flipCard.classList.add("minimalist");
flipCard.draggable = true;
flipCard.dataset.itemId = item.id;

const flipCardInner = document.createElement("div");
flipCardInner.className = "flip-card-inner";

// Face front
const front = document.createElement("div");
front.className = "flip-card-front";

const flipBtnFront = document.createElement("button");
flipBtnFront.className = "flip-btn-front hidden-in-minimalist";
flipBtnFront.innerHTML = "&#x21bb;";
flipBtnFront.title = "Flip";
flipBtnFront.addEventListener("click", () => {
  flipCardInner.classList.add("flipped");
});
front.appendChild(flipBtnFront);

if (item.cover) {
  const imgCover = document.createElement("img");
  imgCover.className = "cover-image";
  imgCover.src = item.cover;
  imgCover.alt = `${item.title} Cover`;
  imgCover.loading = "lazy";
  front.appendChild(imgCover);
}

const frontTop = document.createElement("div");
frontTop.className = "front-top";

const titleEl = document.createElement("div");
titleEl.className = "card-title";
titleEl.textContent = item.title;
frontTop.appendChild(titleEl);

if (item.score) {
  const noteEl = document.createElement("div");
  noteEl.className = "note-label";
  noteEl.textContent = `Note: ${item.score}/10`;
  frontTop.appendChild(noteEl);
}

const statusSpan = document.createElement("span");
statusSpan.className = `status-label ${statusClass(item.status)} hidden-in-minimalist`;
statusSpan.textContent = statusToLabel(item.status);
frontTop.appendChild(statusSpan);

const subinfo = document.createElement("div");
subinfo.className = "subinfo-front hidden-in-minimalist";
const durationDays = calculateDurationDays(item.start_date, item.end_date);
if (durationDays) {
  subinfo.textContent = `${item.type} | Durée: ${durationDays} j.`;
} else {
  subinfo.textContent = `${item.type}`;
}
frontTop.appendChild(subinfo);

// Favori
const favContainer = document.createElement("div");
favContainer.className = "fav-container hidden-in-minimalist";
const favCheck = document.createElement("input");
favCheck.type = "checkbox";
favCheck.checked = !!item.is_fav;
favCheck.title = "Mettre en Favori";
favCheck.addEventListener("change", () => {
  item.is_fav = favCheck.checked;
  updateItem(item);
  renderList(getCurrentFilter()); 
});
favContainer.appendChild(favCheck);

const favLabel = document.createElement("span");
favLabel.textContent = "❤️";
favContainer.appendChild(favLabel);

frontTop.appendChild(favContainer);
front.appendChild(frontTop);

// Bouton Lien
if (item.url) {
  const linkButton = document.createElement("a");
  linkButton.href = item.url;
  linkButton.target = "_blank";
  linkButton.className = "link-button";
  linkButton.textContent = "Voir plus";
  linkButton.setAttribute("aria-label", `Voir plus sur ${item.title}`);
  front.appendChild(linkButton);
}

// Barre de progression
const progressBarContainer = document.createElement("div");
progressBarContainer.className = "progress-bar-container";
const progressBar = document.createElement("div");
progressBar.className = "progress-bar";
progressBar.style.width = calculateProgress(item) + "%";
progressBarContainer.appendChild(progressBar);
front.appendChild(progressBarContainer);

// Stepper
const stepper = document.createElement("div");
stepper.className = "chap-stepper";

const minusBtn = document.createElement("button");
minusBtn.className = "chap-btn";
minusBtn.innerHTML = "-";
minusBtn.title = "Diminuer";
minusBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (item.chapter > 0) {
    item.chapter--;
    updateItem(item);
    renderList(getCurrentFilter());
  }
});
stepper.appendChild(minusBtn);

const chapLabel = document.createElement("span");
chapLabel.className = "chap-label";
chapLabel.id = `chap-label-${item.id}`;
chapLabel.textContent = `Ch/Ep : ${item.chapter}`;
stepper.appendChild(chapLabel);

const plusBtn = document.createElement("button");
plusBtn.className = "chap-btn";
plusBtn.innerHTML = "+";
plusBtn.title = "Augmenter";
plusBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  item.chapter++;
  updateItem(item);
  renderList(getCurrentFilter());
});
stepper.appendChild(plusBtn);

front.appendChild(stepper);

// Face back
const back = document.createElement("div");
back.className = "flip-card-back";

const flipBtnBack = document.createElement("button");
flipBtnBack.className = "flip-btn-back";
flipBtnBack.innerHTML = "&#x21bb;";
flipBtnBack.title = "Flip";
flipBtnBack.addEventListener("click", () => {
  flipCardInner.classList.remove("flipped");
});
back.appendChild(flipBtnBack);

const backTitle = document.createElement("div");
backTitle.className = "back-title";
backTitle.textContent = item.title;
back.appendChild(backTitle);

const infoDiv = document.createElement("div");
infoDiv.className = "back-info";
infoDiv.innerHTML = `
  <p><strong>Score :</strong> ${item.score}/10</p>
  <div class="stars">${createStars(item.score)}</div>
`;
if (item.tags && item.tags.length > 0) {
  infoDiv.innerHTML += `<p><strong>Tags :</strong> ${item.tags.join(", ")}</p>`;
}
back.appendChild(infoDiv);

if (item.notes) {
  const notesDiv = document.createElement("div");
  notesDiv.className = "notes-section";
  notesDiv.textContent = `Notes : ${item.notes}`;
  back.appendChild(notesDiv);
}

if (item.url) {
  const linkDiv = document.createElement("div");
  linkDiv.className = "link-section";
  linkDiv.innerHTML = `Lien : <a href="${item.url}" target="_blank">${item.url}</a>`;
  back.appendChild(linkDiv);
}

// Actions
const actionsDiv = document.createElement("div");
actionsDiv.className = "actions";

const editBtn = document.createElement("button");
editBtn.className = "edit-btn";
editBtn.innerHTML = "&#x270E;";
editBtn.setAttribute("aria-label", `Modifier ${item.title}`);
editBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  openModalForEdit(item);
});
actionsDiv.appendChild(editBtn);

const delBtn = document.createElement("button");
delBtn.className = "delete-btn";
delBtn.innerHTML = "&#x1F5D1;";
delBtn.setAttribute("aria-label", `Supprimer ${item.title}`);
delBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  deleteItem(item.id);
  renderList(getCurrentFilter());
});
actionsDiv.appendChild(delBtn);

back.appendChild(actionsDiv);

flipCardInner.appendChild(front);
flipCardInner.appendChild(back);
flipCard.appendChild(flipCardInner);

// Gestion de la sélection
flipCard.addEventListener('click', (e) => {
  if (selectedCard) {
    selectedCard.classList.remove('selected-card');
  }
  selectedCard = flipCard;
  flipCard.classList.add('selected-card');
  e.stopPropagation();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.flip-card')) {
    if (selectedCard) {
      selectedCard.classList.remove('selected-card');
      selectedCard = null;
    }
  }
});

return flipCard;
};

const statusToLabel = (st) => {
switch (st) {
  case "en-cours": return "En cours";
  case "termine":  return "Terminé";
  case "pause":    return "En pause";
  default:         return st;
}
};

const statusClass = (st) => {
switch (st) {
  case "en-cours": return "en-cours";
  case "termine":  return "termine";
  case "pause":    return "pause";
  default:         return "";
}
};

const createStars = (score) => {
if (!score || score <= 0) return "";
const intScore = Math.floor(score);
let stars = "";
for (let i = 0; i < intScore; i++) {
  stars += "⭐";
}
return stars;
};

/****************************************************
*               DRAG & DROP REORDER                *
****************************************************/
let dragSrcEl = null;
const initDragAndDrop = () => {
if (!listSection) return;
listSection.addEventListener("dragstart", handleDragStart);
listSection.addEventListener("dragover", handleDragOver);
listSection.addEventListener("drop", handleDrop);
};

const handleDragStart = (e) => {
const card = e.target.closest(".flip-card");
if (!card) return;
dragSrcEl = card;
e.dataTransfer.effectAllowed = "move";
e.dataTransfer.setData("text/html", card.innerHTML);
card.style.opacity = "0.4";
};

const handleDragOver = (e) => {
e.preventDefault();
e.dataTransfer.dropEffect = "move";
};

const handleDrop = (e) => {
e.preventDefault();
const card = e.target.closest(".flip-card");
if (!card || card === dragSrcEl) return;
if (dragSrcEl && card.parentNode === dragSrcEl.parentNode) {
  const children = Array.from(card.parentNode.children);
  const srcIndex = children.indexOf(dragSrcEl);
  const dropIndex = children.indexOf(card);
  if (srcIndex < dropIndex) {
    card.parentNode.insertBefore(dragSrcEl, card.nextSibling);
  } else {
    card.parentNode.insertBefore(dragSrcEl, card);
  }
  reorderList();
}
if (dragSrcEl) {
  dragSrcEl.style.opacity = "1";
}
};

const reorderList = () => {
const cardElems = Array.from(listSection.querySelectorAll(".flip-card"));
const newList = [];
cardElems.forEach(card => {
  const id = card.dataset.itemId;
  const item = myList.find(it => it.id === id);
  if (item) {
    newList.push(item);
  }
});
// Remplace la myList globale et sauve
// (si vous stockez l'ordre manuellement, vous pouvez le réenregistrer)
myList.length = 0;
myList.push(...newList);
saveItems();
showToast("Liste réordonnée.", "info");
};

/****************************************************
*         RECHERCHE / AUTOCOMPLÉTION Jikan         *
****************************************************/
let searchTimeout = null;

const initSearch = () => {
if (!searchInput) return;
searchInput.addEventListener("input", onSearchInputDebounced);
searchInput.addEventListener("keydown", handleSearchKeyDown);
document.addEventListener("click", (e) => {
  if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) {
    suggestions.classList.add("hidden");
    searchInput.setAttribute("aria-expanded", "false");
  }
});
};

function onSearchInputDebounced() {
const query = searchInput.value.trim().toLowerCase();

// annule le timeout précédent
if (searchTimeout) {
  clearTimeout(searchTimeout);
}

// si rien
if (!query) {
  suggestions.classList.add("hidden");
  searchInput.setAttribute("aria-expanded", "false");
  renderList(getCurrentFilter());
  return;
}

// nouveau timeout pour "debouncer" la recherche
searchTimeout = setTimeout(() => {
  const results = filterBySearch(query).map(it => it.title);
  if (results.length === 0) {
    suggestions.classList.add("hidden");
    listSection.innerHTML = '<p class="empty-message">Aucun titre correspondant.</p>';
    searchInput.setAttribute("aria-expanded", "false");
    return;
  }
  // affichage des suggestions
  suggestions.innerHTML = "";
  results.slice(0, 6).forEach((title, index) => {
    const li = document.createElement("li");
    li.textContent = title;
    li.setAttribute("role", "option");
    li.setAttribute("id", `suggestion-${index}`);
    li.tabIndex = 0;
    li.addEventListener("click", () => {
      searchInput.value = title;
      suggestions.classList.add("hidden");
      searchInput.setAttribute("aria-expanded", "false");
      // Affiche un seul item correspondant
      const item = myList.find(it => it.title.toLowerCase() === title.toLowerCase());
      if (item) {
        listSection.innerHTML = "";
        listSection.appendChild(createFlipCard(item));
        applyViewSettings();
      }
    });
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        li.click();
      }
    });
    suggestions.appendChild(li);
  });
  suggestions.classList.remove("hidden");
  searchInput.setAttribute("aria-expanded", "true");
}, 300);
}

let currentFocus = -1;
const handleSearchKeyDown = (e) => {
const items = suggestions.getElementsByTagName("li");
if (suggestions.classList.contains("hidden")) return;

if (e.key === "ArrowDown") {
  currentFocus++;
  addActive(items);
  e.preventDefault();
} else if (e.key === "ArrowUp") {
  currentFocus--;
  addActive(items);
  e.preventDefault();
} else if (e.key === "Enter") {
  e.preventDefault();
  if (currentFocus > -1) {
    if (items[currentFocus]) {
      items[currentFocus].click();
    }
  }
}
};

const addActive = (items) => {
if (!items) return;
removeActive(items);
if (currentFocus >= items.length) currentFocus = 0;
if (currentFocus < 0) currentFocus = items.length - 1;
items[currentFocus].classList.add("active");
items[currentFocus].setAttribute("aria-selected", "true");
};

const removeActive = (items) => {
for (let item of items) {
  item.classList.remove("active");
  item.setAttribute("aria-selected", "false");
}
};

/****************************************************
*                  STATS MODAL                     *
****************************************************/
let chartCat, chartStatus, chartTags;

const generateColorArray = (num) => {
const baseColors = [
  'rgba(255, 99, 132, 0.6)',
  'rgba(54, 162, 235, 0.6)',
  'rgba(255, 206, 86, 0.6)',
  'rgba(75, 192, 192, 0.6)',
  'rgba(153, 102, 255, 0.6)',
  'rgba(255, 159, 64, 0.6)'
];
const colors = [];
for (let i = 0; i < num; i++) {
  colors.push(baseColors[i % baseColors.length]);
}
return colors;
};

const initStatsModal = () => {
const btnShowStats = document.getElementById("btn-show-stats");
if (btnShowStats) {
  btnShowStats.addEventListener("click", openStatsModal);
}
if (statsModalOverlay) {
  statsModalOverlay.addEventListener("click", closeStatsModalFn);
}
if (closeStatsModal) {
  closeStatsModal.addEventListener("click", closeStatsModalFn);
}
};

const openStatsModal = () => {
updateStats();
if (statsModal) {
  statsModal.classList.remove("hidden");
  statsModal.focus();
}
};

const closeStatsModalFn = () => {
if (statsModal) statsModal.classList.add("hidden");
const btnShowStats = document.getElementById("btn-show-stats");
if (btnShowStats) btnShowStats.focus();
};

const updateStats = () => {
// 1) Total + Moyenne
const total = myList.length;
if (statsTotal)   statsTotal.textContent = total;
if (statsAverage) {
  if (total === 0) {
    statsAverage.textContent = "0";
  } else {
    const avg = (myList.reduce((acc, it) => acc + (it.score || 0), 0) / total).toFixed(1);
    statsAverage.textContent = avg;
  }
}

// 2) Par Catégorie
const countsByCat = {};
categories.forEach(cat => countsByCat[cat] = 0);
myList.forEach(it => {
  if (!countsByCat[it.type]) countsByCat[it.type] = 0;
  countsByCat[it.type]++;
});

const labelsCat = Object.keys(countsByCat);
const dataCat   = Object.values(countsByCat);

if (chartCat) chartCat.destroy();
if (statsChartCat) {
  chartCat = new Chart(statsChartCat, {
    type: 'bar',
    data: {
      labels: labelsCat,
      datasets: [{
        label: 'Nombre d\'éléments',
        data: dataCat,
        backgroundColor: 'rgba(63, 81, 181, 0.6)',
        borderColor: 'rgba(63, 81, 181, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title:  { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

// 3) Par Statut
const allStatus = ["en-cours", "termine", "pause"];
const countsByStatus = { "en-cours": 0, termine: 0, pause: 0 };
myList.forEach(it => {
  if (countsByStatus[it.status] !== undefined) {
    countsByStatus[it.status]++;
  }
});

const labelsStatus = allStatus.map(st => statusToLabel(st));
const dataStatus   = allStatus.map(st => countsByStatus[st]);

if (chartStatus) chartStatus.destroy();
if (statsChartStatus) {
  chartStatus = new Chart(statsChartStatus, {
    type: 'pie',
    data: {
      labels: labelsStatus,
      datasets: [{
        data: dataStatus,
        backgroundColor: [
          'rgba(56, 142, 60, 0.6)',
          'rgba(211, 47, 47, 0.6)',
          'rgba(251, 192, 45, 0.6)'
        ],
        borderColor: [
          'rgba(56, 142, 60, 1)',
          'rgba(211, 47, 47, 1)',
          'rgba(251, 192, 45, 1)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        title:  { display: false }
      }
    }
  });
}

// 4) Item le plus avancé
if (myList.length > 0 && statsMostAdvanced) {
  let maxItem = myList[0];
  myList.forEach(it => {
    if (calculateProgress(it) > calculateProgress(maxItem)) {
      maxItem = it;
    }
  });
  statsMostAdvanced.textContent = `${maxItem.title} (${calculateProgress(maxItem)}% complété)`;
} else if (statsMostAdvanced) {
  statsMostAdvanced.textContent = "Aucun item";
}

// 5) Par Tags
const tagCounts = {};
myList.forEach(it => {
  if (it.tags && it.tags.length > 0) {
    it.tags.forEach(tag => {
      if (!tagCounts[tag]) tagCounts[tag] = 0;
      tagCounts[tag]++;
    });
  }
});

const labelsTags = Object.keys(tagCounts);
const dataTags   = Object.values(tagCounts);

if (chartTags) chartTags.destroy();
if (statsChartTags) {
  chartTags = new Chart(statsChartTags, {
    type: 'doughnut',
    data: {
      labels: labelsTags,
      datasets: [{
        label: 'Nombre d\'éléments par Tag',
        data: dataTags,
        backgroundColor: generateColorArray(labelsTags.length),
        borderColor: 'rgba(255, 255, 255, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        title:  { display: false }
      }
    }
  });
}
};

/****************************************************
*             IMPORT DES DONNÉES (JSON)            *
****************************************************/
const importDataFromJSON = (file) => {
const reader = new FileReader();
reader.onload = async (e) => {
  try {
    const importedData = JSON.parse(e.target.result);
    // merged approach : concat ou remplacer
    // ou tout écraser : 
    //   myList = importedData.myList || [];
    //   categories = importedData.categories || [];
    //   await saveItems(); // etc.
    //   reload etc.

    // Ici on choisit l’option “tout écraser” :
    const newMyList = importedData.myList || [];
    const newCategories = importedData.categories || [];

    // On vide et on remplit:
    myList.length = 0;
    myList.push(...newMyList);

    // Idem pour categories
    categories.length = 0;
    categories.push(...newCategories);

    // Sauvegarde
    await saveItems();
    await loadItems(); 
    await loadCategories(); // si vous gérez tout via supabase

    populateFilterDropdown();
    renderCatList();
    refreshItemTypeSelect();
    renderList('all');

    showToast("Données importées avec succès.", "success");
  } catch (err) {
    console.error("Erreur d'import JSON :", err);
    showToast("Erreur lors de l'importation des données.", "error");
  }
};
reader.readAsText(file);
};

/****************************************************
*          SUPPRESSION DES DOUBLONS                *
****************************************************/
const removeDuplicates = () => {
let duplicatesCount = 0;
const uniqueItems = {};

myList = myList.filter(item => {
  const key = `${item.type.toLowerCase()}-${item.title.toLowerCase()}`;
  if (uniqueItems[key]) {
    duplicatesCount++;
    return false;
  } else {
    uniqueItems[key] = true;
    return true;
  }
});

saveItems();
renderList(getCurrentFilter());
showToast(`Doublons supprimés : ${duplicatesCount}`, "success");
};

/****************************************************
*           NAVIGATION MOBILE / BOTTOM NAV         *
****************************************************/
function initMobileNavigation() {
const searchContainer = document.querySelector('.search-container');
const navRight        = document.querySelector('.nav-right');

if (!searchContainer || !navRight) return;

const navHome = document.getElementById('nav-home');
if (navHome) {
  navHome.addEventListener('click', (e) => {
    e.preventDefault();
    searchContainer.classList.remove('active');
    navRight.classList.remove('active');
    renderList('all');
  });
}

const navSearch = document.getElementById('nav-search');
if (navSearch) {
  navSearch.addEventListener('click', (e) => {
    e.preventDefault();
    searchContainer.classList.toggle('active');
    navRight.classList.remove('active');
    if (searchContainer.classList.contains('active')) {
      searchInput.focus();
    }
  });
}

const navAdd = document.getElementById('nav-add');
if (navAdd) {
  navAdd.addEventListener('click', (e) => {
    e.preventDefault();
    openModalForAdd();
    searchContainer.classList.remove('active');
  });
}

const navMenu = document.getElementById('nav-menu');
if (navMenu) {
  navMenu.addEventListener('click', (e) => {
    e.preventDefault();
    navRight.classList.toggle('active');
    searchContainer.classList.remove('active');

    if (navRight.classList.contains('active')) {
      navRight.style.display = 'flex';
      navRight.style.flexDirection = 'column';
      navRight.style.position = 'fixed';
      navRight.style.top = '60px';
      navRight.style.left = '0';
      navRight.style.width = '100%';
      navRight.style.background = 'var(--card-background)';
      navRight.style.padding = '1rem';
      navRight.style.boxShadow = 'var(--header-shadow)';
      navRight.style.zIndex = '998';
    } else {
      navRight.style.display = 'none';
    }
  });
}

// Fermer au scroll
window.addEventListener('scroll', () => {
  searchContainer.classList.remove('active');
  navRight.classList.remove('active');
  navRight.style.display = 'none';
});

// Mise à jour état bouton
const updateActiveButton = (clickedId) => {
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === clickedId);
  });
};

document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => updateActiveButton(btn.id));
});
}

/****************************************************
*      GÉNÉRATION DE LIEN ANIME-SAMA (option)      *
****************************************************/
/**
* Exemple de structure d’URL générée :
* - anime : https://anime-sama.fr/catalogue/<title>/saison1/vf/chapitre-5
* - manga : https://anime-sama.fr/catalogue/<title>/scan/vf/chapitre-5
*
* À adapter selon vos besoins.
*/
function createAnimeSamaLink(title, chapter, category) {
const chapterStr = String(chapter);
// Par exemple :
const segment = (category.toLowerCase() === 'anime') ? 'saison1' : 'scan';
// Retour simple (pour l’exemple) :
return `https://anime-sama.fr/catalogue/${title}/${segment}/vf/chapitre-${chapterStr}`;
}

/****************************************************
*    GESTION DE LA TOUCHE SUPPR SUR L'ÉLÉMENT      *
****************************************************/
const handleKeyPress = async (e) => {
if (e.key === 'Delete' && selectedCard) {
  const itemId = selectedCard.dataset.itemId;
  if (itemId) {
    await deleteItem(itemId);
    renderList(getCurrentFilter());
  }
}
};
