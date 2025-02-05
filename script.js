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
    addCategory, // Ajoutez cette ligne
    deleteCategory // Ajoutez cette ligne aussi par sécurité
} from './supabase.js';
import { showToast, generateUUID } from './utils.js';

// Récupération des variables de Supabase
// const { supabase, currentUser } = window;

/****************************************************
     *                LOCAL STORAGE KEYS                *
     ****************************************************/
const STORAGE_KEY_ITEMS = "myMiniMAL_items";
const STORAGE_KEY_CATS = "myMiniMAL_categories";
const STORAGE_KEY_THEME = "myMiniMAL_darkmode";
const STORAGE_KEY_MINIMAL_VIEW = "myMiniMAL_minimalView";

/****************************************************
 *       WELCOME SCREEN (Ne plus afficher)          *
 ****************************************************/
const shouldShowWelcome = () => localStorage.getItem("skipWelcome") !== "true";
const setSkipWelcome = () => localStorage.setItem("skipWelcome", "true");

/****************************************************
 *             GESTION DES CATEGORIES               *
 ****************************************************/

/****************************************************
 *              DATA MANAGER (ITEMS)                *
 ****************************************************/

/****************************************************
 *          IMPORT / EXPORT DES DONNÉES             *
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
 *       RECHERCHE, FILTRAGE ET TRI DES ITEMS        *
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
  if (diff < 0) return null; // si end_date < start_date
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
// Tri
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
      return items; // default -> ordre d'insertion
  }
};

/****************************************************
 *               THEME (DARK/LIGHT)                 *
 ****************************************************/
const applyTheme = () => {
  const isDark = localStorage.getItem(STORAGE_KEY_THEME) === "true";
  document.body.classList.toggle("dark-mode", isDark);
  const themeBtn = document.getElementById("toggle-theme-btn");
  
  // Mise à jour de l'icône
  const themeIcon = themeBtn.querySelector("i");
  themeIcon.className = isDark ? "fas fa-sun" : "fas fa-moon";
  
  // Optionnel : Mettre à jour le titre pour l'accessibilité
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
 *       VUE MINIMALISTE ET PLEIN ÉCRAN IMAGES       *
 ****************************************************/
let isMinimalView = localStorage.getItem(STORAGE_KEY_MINIMAL_VIEW) === "true";

const applyViewSettings = () => {
  const viewBtn = document.getElementById("toggle-minimal-view-btn");
  const viewIcon = viewBtn.querySelector("i");
  
  if (isMinimalView) {
    document.getElementById("list-section").classList.add("minimalist-view");
    document.querySelectorAll(".flip-card").forEach(card => card.classList.add("minimalist"));
    viewIcon.className = "fas fa-table-list"; // Vue standard
    viewBtn.title = "Passer en vue standard";
  } else {
    document.getElementById("list-section").classList.remove("minimalist-view");
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
 *            DOM ELEMENTS / INIT GLOBAL            *
 ****************************************************/
// WELCOME
const welcomeScreen = document.getElementById("welcome-screen");
const dontShowAgain = document.getElementById("dont-show-again");
const btnCloseWelcome = document.getElementById("btn-close-welcome");

// THEME
const toggleThemeBtn = document.getElementById("toggle-theme-btn");

// ITEM MODAL
const itemModal = document.getElementById("item-modal");
const modalOverlay = document.getElementById("modal-overlay");
const closeModalIcon = document.getElementById("close-modal");
const cancelBtn = document.getElementById("cancel-btn");
const itemForm = document.getElementById("item-form");
const itemIdInput = document.getElementById("item-id");
const itemTypeSelect = document.getElementById("item-type");
const itemTitleInput = document.getElementById("item-title");
const itemCoverInput = document.getElementById("item-cover");
const itemChapInput = document.getElementById("item-chapter");
const itemTotalInput = document.getElementById("item-total");
const itemStatusSel = document.getElementById("item-status");
const itemScoreInput = document.getElementById("item-score");
const itemUrlInput = document.getElementById("item-url");
const itemFavCheck = document.getElementById("item-fav");
const itemNotesArea = document.getElementById("item-notes");
const itemstart_date = document.getElementById("item-start-date");
const itemend_date = document.getElementById("item-end-date");
const itemTagsInput = document.getElementById("item-tags");
const modalTitle = document.getElementById("modal-title");
const findCoverBtn = document.getElementById("find-cover-btn");
const coverPreviewImg = document.getElementById("cover-preview");

// CATS MODAL
const catModal = document.getElementById("cat-modal");
const catModalOverlay = document.getElementById("cat-modal-overlay");
const closeCatModal = document.getElementById("close-cat-modal");
const catListUl = document.getElementById("cat-list");
const catInput = document.getElementById("cat-input");
const addCatBtn = document.getElementById("add-cat-btn");

// STATS MODAL
const statsModal = document.getElementById("stats-modal");
const statsModalOverlay = document.getElementById("stats-modal-overlay");
const closeStatsModal = document.getElementById("close-stats-modal");
const statsTotal = document.getElementById("stats-total");
const statsAverage = document.getElementById("stats-average");
const statsChartCat = document.getElementById("stats-chart-cat");
const statsChartStatus = document.getElementById("stats-chart-status");
const statsMostAdvanced = document.getElementById("stats-most-advanced");
const statsChartTags = document.getElementById("stats-chart-tags");
const btnRemoveDuplicates = document.getElementById("btn-remove-duplicates"); // Bouton pour supprimer les doublons

// MAIN + FILTRES + TRI
const listSection = document.getElementById("list-section");
const filterSelect = document.getElementById("filter-select"); // Nouveau sélecteur de filtre
const sortSelect = document.getElementById("sort-select"); // Sélecteur de tri ajouté

// RECHERCHE
const searchInput = document.querySelector('.search-container .search-input');
const suggestions = document.getElementById("suggestions"); // Élément ajouté

// IMPORT/EXPORT
const exportBtn = document.getElementById("export-btn");
const importFile = document.getElementById("import-file");

// TOAST
const toastContainer = document.getElementById("toast-container");

// HAMBURGER MENU
const hamburger = document.getElementById("hamburger");

// AUTH
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');

// Ajouter ces variables globales après les autres déclarations
let selectedCard = null;

// Update the initialization code
document.addEventListener("DOMContentLoaded", async () => {
  if (!await checkAuth()) return;

  try {
    await loadCategories();
    await loadItems();
    
    // Update UI after data is loaded
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
    initHamburgerMenu();

    toggleThemeBtn.addEventListener("click", toggleTheme);
    exportBtn.addEventListener("click", exportDataToJSON);
    importFile.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        importDataFromJSON(e.target.files[0]);
        e.target.value = ""; // Reset input file
      }
    });
    btnRemoveDuplicates.addEventListener("click", removeDuplicates);

    // Boutons Vue Minimaliste
    document.getElementById("toggle-minimal-view-btn").addEventListener("click", toggleMinimalView);

    // Sélecteur de tri
    sortSelect.addEventListener("change", () => {
      renderList(getCurrentFilter());
    });

    // Sélecteur de filtre
    filterSelect.addEventListener("change", () => {
      renderList(filterSelect.value);
    });

    // Bouton "Ajouter"
    document.getElementById("btn-open-modal").addEventListener("click", openModalForAdd);

    renderList(getCurrentFilter());
    initDragAndDrop();

    // Gestion de l'authentification
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        btnLogin.classList.add('hidden');
        btnLogout.classList.remove('hidden');
        // Ajouter l'écouteur d'événement pour la déconnexion
        btnLogout.addEventListener('click', handleLogout);
    } else {
        btnLogin.classList.remove('hidden');
        btnLogout.classList.add('hidden');
    }

    // Ajouter l'écouteur pour la touche Suppr
    document.addEventListener('keydown', handleKeyPress);
  } catch (error) {
    console.error('Error during initialization:', error);
    showToast('Error initializing application', 'error');
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    showToast("Déconnexion réussie", "success");
    // Redirection immédiate
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error);
    showToast("Erreur lors de la déconnexion", "error");
  }
});

/****************************************************
 *               WELCOME SCREEN INIT                *
 ****************************************************/
const initWelcome = () => {
  if (shouldShowWelcome()) {
    welcomeScreen.classList.remove("hidden");
    // Focus management
    welcomeScreen.focus();
  }
  btnCloseWelcome.addEventListener("click", () => {
    if (dontShowAgain.checked) {
      setSkipWelcome();
    }
    welcomeScreen.classList.add("hidden");
    // Return focus to the main content
    document.querySelector('.top-nav').focus();
  });
};

/****************************************************
 *               FILTRES DYNAMIQUES                 *
 ****************************************************/
const populateFilterDropdown = () => {
  filterSelect.innerHTML = '<option value="all">Tous</option>';
  categories.forEach(cat => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    filterSelect.appendChild(option);
  });
};

/****************************************************
 *               CAT MODAL MANAGER                  *
 ****************************************************/
const initCategoryManager = () => {
  document.getElementById("btn-manage-cats").addEventListener("click", openCatModal);
  catModalOverlay.addEventListener("click", closeCatModalFn);
  closeCatModal.addEventListener("click", closeCatModalFn);

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

  catInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCatBtn.click();
    }
  });
};

const openCatModal = () => {
  catModal.classList.remove("hidden");
  renderCatList();
  catInput.focus();
};
const closeCatModalFn = () => {
  catModal.classList.add("hidden");
  // Return focus à la gestion des catégories
  document.getElementById("btn-manage-cats").focus();
};
const renderCatList = () => {
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
 *             MODALE AJOUT/EDIT ITEM               *
 ****************************************************/
const initItemModal = () => {
  closeModalIcon.addEventListener("click", closeItemModalFn);
  modalOverlay.addEventListener("click", closeItemModalFn);
  cancelBtn.addEventListener("click", closeItemModalFn);
  itemForm.addEventListener("submit", onFormSubmit);

  // Keyboard accessibility: Fermer la modale avec 'Échap'
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!itemModal.classList.contains("hidden")) {
        closeItemModalFn();
      }
      if (!catModal.classList.contains("hidden")) {
        closeCatModalFn();
      }
      if (!statsModal.classList.contains("hidden")) {
        closeStatsModalFn();
      }
    }
  });

};
const refreshItemTypeSelect = () => {
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
  modalTitle.textContent = "Ajouter un élément";
  itemIdInput.value = "";
  if (categories.length > 0) {
    itemTypeSelect.value = categories[0];
  }
  itemTitleInput.value = "";
  itemCoverInput.value = "";
  coverPreviewImg.src = "";
  coverPreviewImg.style.display = "none";
  itemChapInput.value = 0;
  itemTotalInput.value = 0;
  itemStatusSel.value = "en-cours";
  itemScoreInput.value = 0;
  itemUrlInput.value = "";
  itemFavCheck.checked = false;
  itemNotesArea.value = "";
  itemstart_date.value = "";
  itemend_date.value = "";
  itemTagsInput.value = "";
  itemModal.classList.remove("hidden");
  itemTitleInput.focus();
};
const closeItemModalFn = () => {
  itemModal.classList.add("hidden");
  // Return focus à l'ajout d'élément
  document.getElementById("btn-open-modal").focus();
};
const openModalForEdit = (item) => {
  modalTitle.textContent = "Modifier un élément";
  itemIdInput.value = item.id;
  itemTypeSelect.value = item.type;
  itemTitleInput.value = item.title;
  itemCoverInput.value = item.cover || "";
  if (item.cover) {
    coverPreviewImg.src = item.cover;
    coverPreviewImg.style.display = "block";
  } else {
    coverPreviewImg.src = "";
    coverPreviewImg.style.display = "none";
  }
  itemChapInput.value = item.chapter;
  itemTotalInput.value = item.total || 0;
  itemStatusSel.value = item.status || "en-cours";
  itemScoreInput.value = item.score || 0;
  itemUrlInput.value = item.url || "";
  itemFavCheck.checked = !!item.is_fav;
  itemNotesArea.value = item.notes || "";
  itemstart_date.value = item.start_date || "";
  itemend_date.value = item.end_date || "";
  itemTagsInput.value = (item.tags || []).join(", ");
  itemModal.classList.remove("hidden");
  itemTitleInput.focus();
};
const onFormSubmit = async (e) => {
  e.preventDefault();
  const id = itemIdInput.value;
  const type = itemTypeSelect.value;
  const title = itemTitleInput.value.trim();
  const cover = itemCoverInput.value.trim();
  const chapter = parseInt(itemChapInput.value, 10) || 0;
  const total = parseInt(itemTotalInput.value, 10) || 0;
  const status = itemStatusSel.value;
  const score = parseFloat(itemScoreInput.value) || 0;
  const url = itemUrlInput.value.trim();
  const is_fav = itemFavCheck.checked;
  const notes = itemNotesArea.value.trim();
  const start_date = itemstart_date.value || null;
  const end_date = itemend_date.value || null;      
  const tagsRaw = itemTagsInput.value.trim();
  const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

  if (!type || !title) {
    showToast("Catégorie et Titre sont obligatoires.", "warning");
    return;
  }

  try {
    if (!id) {
      // Nouveau
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
    await loadItems(); // Recharger la liste complète
    renderList(getCurrentFilter());
  } catch (error) {
    console.error('Erreur lors de la soumission:', error);
    showToast('Erreur lors de la sauvegarde', 'error');
  }
};

/****************************************************
 *               RECHERCHE D'IMAGE                   *
 ****************************************************/
const findCoverImage = async (title) => {
  const apiUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`;
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Erreur réseau: ${response.status}`);
    }
    const data = await response.json();
    if (data.data && data.data.length > 0) {
      const anime = data.data[0];
      return anime.images.jpg.image_url; // URL de l'image de couverture
    } else {
      // Si aucun anime n'est trouvé, tenter de chercher un manga
      const mangaUrl = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=1`;
      const mangaResponse = await fetch(mangaUrl);
      if (!mangaResponse.ok) {
        throw new Error(`Erreur réseau: ${mangaResponse.status}`);
      }
      const mangaData = await mangaResponse.json();
      if (mangaData.data && mangaData.data.length > 0) {
        const manga = mangaData[0];
        return manga.images.jpg.image_url; // URL de l'image de couverture
      } else {
        return null; // Aucune image trouvée
      }
    }
  } catch (error) {
    console.error("Erreur lors de la recherche de l'image:", error);
    showToast("Erreur lors de la recherche de l'image.", "error");
    return null;
  }
};

// Ajouter un écouteur d'événement pour le bouton "Trouver l'image"
findCoverBtn.addEventListener("click", async () => {
  const title = itemTitleInput.value.trim();
  if (!title) {
    showToast("Veuillez entrer un titre avant de rechercher une image.", "warning");
    itemTitleInput.focus();
    return;
  }
  findCoverBtn.disabled = true;
  findCoverBtn.textContent = "🔍...";
  // const imageUrl = await findCoverImage(title);
  if (itemCoverInput) {
    // itemCoverInput.value = imageUrl;
    coverPreviewImg.src = itemCoverInput.value;
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

// Afficher un aperçu de l'image de couverture lorsque l'URL est saisie manuellement
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

/****************************************************
 *               AFFICHAGE DE LA LISTE              *
 *           + DRAG & DROP POUR REORDONNER          *
 ****************************************************/
const renderList = (filter = "all") => {
  console.log("Rendu de la liste avec filtre:", filter);
  console.log("Nombre d'items dans myList:", myList.length);
  
  listSection.innerHTML = "";
  let items = filterByType(filter);

  console.log("Items filtrés:", items.length);

  // Tri
  const sortMode = sortSelect.value; // Utiliser la valeur du sélecteur de tri
  items = sortItems(items, sortMode);

  // Recherche
  const query = searchInput.value.trim().toLowerCase();
  if (query) {
    items = filterBySearch(query);
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

  // Appliquer les classes selon les réglages de vue
  applyViewSettings();
  console.log("Rendu terminé");
};

const getCurrentFilter = () => {
  return filterSelect.value || "all";
};

const createFlipCard = (item) => {
  const flipCard = document.createElement("div");
  flipCard.className = "flip-card fade-in";
  if (isMinimalView) flipCard.classList.add("minimalist");
  flipCard.draggable = true;
  flipCard.dataset.itemId = item.id;

  const flipCardInner = document.createElement("div");
  flipCardInner.className = "flip-card-inner";

  // Face FRONT
  const front = document.createElement("div");
  front.className = "flip-card-front";

  const flipBtnFront = document.createElement("button");
  flipBtnFront.className = "flip-btn-front hidden-in-minimalist";
  flipBtnFront.innerHTML = '&#x21bb;'; // Symbole de rotation
  flipBtnFront.title = "Flip";
  flipBtnFront.addEventListener("click", () => {
    flipCardInner.classList.add("flipped");
  });
  front.appendChild(flipBtnFront);

  // Couverture
  if (item.cover) {
    const imgCover = document.createElement("img");
    imgCover.className = "cover-image";
    imgCover.src = item.cover;
    imgCover.alt = `${item.title} Cover`;
    imgCover.loading = "lazy"; // Chargement différé
    front.appendChild(imgCover);
  }

  // Titre + Note + sous-info
  const frontTop = document.createElement("div");
  frontTop.className = "front-top";

  const titleEl = document.createElement("div");
  titleEl.className = "card-title";
  titleEl.textContent = item.title;
  frontTop.appendChild(titleEl);

  // Ajout de la note sur le devant
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

  // Favori ? 
  const favContainer = document.createElement("div");
  favContainer.className = "fav-container hidden-in-minimalist";
  const favCheck = document.createElement("input");
  favCheck.type = "checkbox";
  favCheck.checked = !!item.is_fav;
  favCheck.title = "Mettre en Favori";
  favCheck.addEventListener("change", () => {
    item.is_fav = favCheck.checked;
    updateItem(item);
    renderList(getCurrentFilter()); // Rafraîchir la liste après modification du favori
  });
  favContainer.appendChild(favCheck);
  const favLabel = document.createElement("span");
  favLabel.className = "hidden-in-minimalist"
  favLabel.textContent = "❤️";
  favContainer.appendChild(favLabel);

  frontTop.appendChild(favContainer);
  front.appendChild(frontTop);

  // **Ajout du Bouton de Lien Hypertexte**
  if (item.url) {
    const linkButton = document.createElement("a");
    linkButton.href = item.url;
    linkButton.target = "_blank"; // Ouvre le lien dans un nouvel onglet
    linkButton.className = "link-button";
    linkButton.textContent = "Voir plus";
    linkButton.setAttribute("aria-label", `Voir plus sur ${item.title}`);
    front.appendChild(linkButton); // Ajout en dernier pour positionnement
  }

  // Section des notes sur le devant
  // if (item.notes) {
  //   const notesDiv = document.createElement("div");
  //   notesDiv.className = "front-notes hidden-in-minimalist";
  //   notesDiv.textContent = `Notes: ${item.notes}`;
  //   front.appendChild(notesDiv);
  // }

  // Progress bar
  const progressBarContainer = document.createElement("div");
  progressBarContainer.className = "progress-bar-container";
  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";
  const progressValue = calculateProgress(item);
  progressBar.style.width = progressValue + "%";
  progressBarContainer.appendChild(progressBar);
  front.appendChild(progressBarContainer);

  // Stepper
  const stepper = document.createElement("div");
  stepper.className = "chap-stepper";

  const minusBtn = document.createElement("button");
  minusBtn.className = "chap-btn";
  minusBtn.innerHTML = '-'; // Symbole moins
  minusBtn.title = "Diminuer";
  minusBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Empêche le flip
    if (item.chapter > 0) {
      item.chapter--;
      updateItem(item);
      updateChapLabel(item.id, item.chapter);
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
  plusBtn.innerHTML = '+'; // Symbole plus
  plusBtn.title = "Augmenter";
  plusBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Empêche le flip
    item.chapter++;
    updateItem(item);
    updateChapLabel(item.id, item.chapter);
  });
  stepper.appendChild(plusBtn);

  front.appendChild(stepper);

  // Face BACK
  const back = document.createElement("div");
  back.className = "flip-card-back";

  const flipBtnBack = document.createElement("button");
  flipBtnBack.className = "flip-btn-back";
  flipBtnBack.innerHTML = '&#x21bb;'; // Symbole de rotation
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
  // Affiche les tags s'il y en a
  if (item.tags && item.tags.length > 0) {
    infoDiv.innerHTML += `<p><strong>Tags :</strong> ${item.tags.join(", ")}</p>`;
  }
  back.appendChild(infoDiv);

  // Notes
  if (item.notes) {
    const notesDiv = document.createElement("div");
    notesDiv.className = "notes-section";
    notesDiv.textContent = `Notes : ${item.notes}`;
    back.appendChild(notesDiv);
  }

  // Lien
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
  editBtn.innerHTML = '&#x270E;'; // Symbole de crayon
  editBtn.setAttribute("aria-label", `Modifier ${item.title}`);
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Empêche le flip
    openModalForEdit(item);
  });
  actionsDiv.appendChild(editBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "delete-btn";
  delBtn.innerHTML = '&#x1F5D1;'; // Symbole de poubelle
  delBtn.setAttribute("aria-label", `Supprimer ${item.title}`);
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Empêche le flip
    deleteItem(item.id);
    renderList(getCurrentFilter());
  });
  actionsDiv.appendChild(delBtn);

  back.appendChild(actionsDiv);

  flipCardInner.appendChild(front);
  flipCardInner.appendChild(back);
  flipCard.appendChild(flipCardInner);

  // Ajouter ces gestionnaires d'événements juste après la création de flipCard
  flipCard.addEventListener('click', (e) => {
    // Retirer la sélection précédente
    if (selectedCard) {
        selectedCard.classList.remove('selected-card');
    }
    // Définir la nouvelle sélection
    selectedCard = flipCard;
    flipCard.classList.add('selected-card');
    e.stopPropagation();
  });

  // Retirer la sélection quand on clique en dehors
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

const updateChapLabel = (id, newChapter) => {
  const item = myList.find(it => it.id === id);
  if (item) {
    item.chapter = newChapter;
    renderList(getCurrentFilter()); // Rafraîchir toute la liste
  }
};

const statusToLabel = (st) => {
  switch (st) {
    case "en-cours": return "En cours";
    case "termine": return "Terminé";
    case "pause": return "En pause";
    default: return st;
  }
};
const statusClass = (st) => {
  switch (st) {
    case "en-cours": return "en-cours";
    case "termine": return "termine";
    case "pause": return "pause";
    default: return "";
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
 *           DRAG & DROP (Custom Reorder)           *
 ****************************************************/
let dragSrcEl = null;
const initDragAndDrop = () => {
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
  myList = newList;
  saveItems();
  showToast("Liste réordonnée.", "info");
};

/****************************************************
 *               RECHERCHE / AUTOCOMP               *
 ****************************************************/
const initSearch = () => {
  searchInput.addEventListener("input", onSearchInput);
  searchInput.addEventListener("keydown", handleSearchKeyDown);
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) {
      suggestions.classList.add("hidden");
      searchInput.setAttribute("aria-expanded", "false");
    }
  });
};
const onSearchInput = () => {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    suggestions.classList.add("hidden");
    searchInput.setAttribute("aria-expanded", "false");
    renderList(getCurrentFilter());
    return;
  }
  const results = filterBySearch(query).map(it => it.title);
  if (results.length === 0) {
    suggestions.classList.add("hidden");
    listSection.innerHTML = '<p class="empty-message">Aucun titre correspondant.</p>';
    searchInput.setAttribute("aria-expanded", "false");
    return;
  }
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
};
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
  if (!items) return false;
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
 *               MODALE STATS (GRAPHIQUES)           *
 ****************************************************/
let chartCat, chartStatus, chartTags;
// Fonction pour générer un tableau de couleurs aléatoires
const generateColorArray = (num) => {
  const colors = [];
  const baseColors = [
    'rgba(255, 99, 132, 0.6)',   // Rouge
    'rgba(54, 162, 235, 0.6)',   // Bleu
    'rgba(255, 206, 86, 0.6)',   // Jaune
    'rgba(75, 192, 192, 0.6)',   // Vert
    'rgba(153, 102, 255, 0.6)',  // Violet
    'rgba(255, 159, 64, 0.6)'    // Orange
  ];
  for (let i = 0; i < num; i++) {
    colors.push(baseColors[i % baseColors.length]);
  }
  return colors;
};


const initStatsModal = () => {
  document.getElementById("btn-show-stats").addEventListener("click", openStatsModal);
  statsModalOverlay.addEventListener("click", closeStatsModalFn);
  closeStatsModal.addEventListener("click", closeStatsModalFn);
  // Ajout de l'écouteur pour supprimer les doublons
  document.getElementById("btn-remove-duplicates").addEventListener("click", removeDuplicates);
};
const openStatsModal = () => {
  updateStats();
  statsModal.classList.remove("hidden");
  // Focus management
  statsModal.focus();
};
const closeStatsModalFn = () => {
  statsModal.classList.add("hidden");
  // Return focus au bouton d'affichage des stats
  document.getElementById("btn-show-stats").focus();
};
const updateStats = () => {
  // 1) Total + moyenne
  const total = myList.length;
  statsTotal.textContent = total;
  if (total === 0) {
    statsAverage.textContent = "0";
  } else {
    const avg = (myList.reduce((acc, it) => acc + (it.score || 0), 0) / total).toFixed(1);
    statsAverage.textContent = avg;
  }

  // 2) Par Catégorie
  const countsByCat = {};
  categories.forEach(cat => countsByCat[cat] = 0);
  myList.forEach(it => {
    if (!countsByCat[it.type]) countsByCat[it.type] = 0;
    countsByCat[it.type]++;
  });

  const labelsCat = Object.keys(countsByCat);
  const dataCat = Object.values(countsByCat);

  if (chartCat) chartCat.destroy(); // Détruire l'ancien graphique si existant

  chartCat = new Chart(document.getElementById('stats-chart-cat'), {
    type: 'bar',
    data: {
      labels: labelsCat,
      datasets: [{
        label: 'Nombre d\'éléments',
        data: dataCat,
        backgroundColor: 'rgba(63, 81, 181, 0.6)', // Couleur Indigo avec transparence
        borderColor: 'rgba(63, 81, 181, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: false }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });

  // 3) Par Statut
  const allStatus = ["en-cours", "termine", "pause"];
  const countsByStatus = { "en-cours": 0, termine: 0, pause: 0 };
  myList.forEach(it => {
    if (countsByStatus[it.status] !== undefined) {
      countsByStatus[it.status]++;
    }
  });

  const labelsStatus = allStatus.map(st => statusToLabel(st));
  const dataStatus = allStatus.map(st => countsByStatus[st]);

  if (chartStatus) chartStatus.destroy();

  chartStatus = new Chart(document.getElementById('stats-chart-status'), {
    type: 'pie',
    data: {
      labels: labelsStatus,
      datasets: [{
        data: dataStatus,
        backgroundColor: [
          'rgba(56, 142, 60, 0.6)',   // Vert pour "En cours"
          'rgba(211, 47, 47, 0.6)',   // Rouge pour "Terminé"
          'rgba(251, 192, 45, 0.6)'    // Jaune pour "En pause"
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
        title: { display: false }
      }
    }
  });

  // 4) Item le plus avancé
  if (myList.length > 0) {
    let maxItem = myList[0];
    myList.forEach(it => {
      if (calculateProgress(it) > calculateProgress(maxItem)) {
        maxItem = it;
      }
    });
    statsMostAdvanced.textContent = `${maxItem.title} (${calculateProgress(maxItem)}% complété)`;
  } else {
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
  const dataTags = Object.values(tagCounts);

  if (chartTags) chartTags.destroy();

  chartTags = new Chart(document.getElementById('stats-chart-tags'), {
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
        title: { display: false }
      }
    }
  });
};


/****************************************************
 *                  TOAST NOTIFICATIONS             *
 ****************************************************/
let currentToast = null; // Variable pour gérer les toasts non empilés

/****************************************************
 *               SUPPRESSION DES DOUBLONS            *
 ****************************************************/
const removeDuplicates = () => {
  let duplicatesCount = 0;
  const uniqueItems = {};

  myList = myList.filter(item => {
    const key = `${item.type.toLowerCase()}-${item.title.toLowerCase()}`;
    if (uniqueItems[key]) {
      duplicatesCount++;
      return false; // Supprimer le doublon
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
 *               MENU HAMBURGER                      *
 ****************************************************/
const initHamburgerMenu = () => {
  hamburger.addEventListener("click", toggleHamburgerMenu);
  hamburger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleHamburgerMenu();
    }
  });
};
const toggleHamburgerMenu = () => {
  navRight.classList.toggle("active");
  hamburger.classList.toggle("active");
};

const mangaAutocomplete = document.getElementById('manga-autocomplete');
const coverPreview = document.getElementById('cover-preview');


async function fetchMangaSuggestions(query) {


  let apiUrl = '';
  const itemType = itemTypeSelect.value.toLowerCase();

  if (itemType === 'light novel') {
    // Les light novels sont généralement classés sous "manga" avec le type "novel"
    apiUrl = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=6`;
  }
  if (itemType === 'manhwa/manhua') {
    apiUrl = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(query)}&limit=6`;
  }
  else {
    apiUrl = `https://api.jikan.moe/v4/${itemType}?q=${encodeURIComponent(query)}&limit=6`;
  }

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Erreur: ${response.status}`);
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Erreur de récupération des mangas:', error);
    return [];
  }
}

// Fonction pour afficher les suggestions
function handleAutocompleteSuggestions(items) {
  mangaAutocomplete.innerHTML = '';

  if (!items.length) {
      mangaAutocomplete.style.display = 'none';
      return;
  }

  items.forEach(item => {
      const suggestionDiv = document.createElement('div');
      suggestionDiv.className = 'autocomplete-item';
      
      const imageUrl = item.images?.jpg?.image_url || '';
      const title = item.title || 'Sans titre';
      
      suggestionDiv.innerHTML = `
          <div class="suggestion-content">
              ${imageUrl ? `<img src="${imageUrl}" alt="" loading="lazy" />` : ''}
              <span class="suggestion-title">${title}</span>
          </div>
      `;
      
      suggestionDiv.addEventListener('click', () => selectManga(item));
      mangaAutocomplete.appendChild(suggestionDiv);
  });

  mangaAutocomplete.style.display = 'block';
}

// Gestion de la saisie utilisateur
itemTitleInput.addEventListener('input', async () => {
  const query = itemTitleInput.value.trim();
  // if (query.length < 2) {
  //   mangaAutocomplete.style.display = 'none';
  //   return;
  // }
  const suggestions = await fetchMangaSuggestions(query);
  handleAutocompleteSuggestions(suggestions);
});

// Fermer l'autocomplétion en cliquant à l'extérieur
document.addEventListener('click', (e) => {
  if (!mangaAutocomplete.contains(e.target) && e.target !== itemTitleInput) {
    mangaAutocomplete.style.display = 'none';
  }
});

// Mise à jour manuelle de l'aperçu de la couverture via le champ URL
itemCoverInput.addEventListener('input', () => {
  const url = itemCoverInput.value.trim();
  if (url) {
    coverPreview.src = url;
    coverPreview.alt = "Aperçu de la couverture";
  } else {
    coverPreview.src = '';
  }
});

// Au début du fichier, ajoutons des catégories par défaut
const DEFAULT_CATEGORIES = ['Manga', 'Anime', 'Film', 'Série'];

// Fonction pour initialiser les catégories
async function initCategories() {
const storedCategories = localStorage.getItem('categories');
if (!storedCategories) {
    localStorage.setItem('categories', JSON.stringify(DEFAULT_CATEGORIES));
}

const categories = JSON.parse(localStorage.getItem('categories')) || DEFAULT_CATEGORIES;
const typeSelect = document.getElementById('item-type');
const filterSelect = document.getElementById('filter-select');

// Vider les selects
typeSelect.innerHTML = '';
filterSelect.innerHTML = '<option value="all">Tous</option>';

// Ajouter les catégories aux selects
categories.forEach(category => {
    typeSelect.add(new Option(category, category));
    filterSelect.add(new Option(category, category));
});
}

// Dans votre fonction d'initialisation principale
document.addEventListener('DOMContentLoaded', async () => {
await initCategories();
// ...existing code...
});

// Dans la fonction qui ouvre le modal d'ajout
function openModal() {
const modal = document.getElementById('item-modal');
modal.classList.remove('hidden');
initCategories(); // Rafraîchir les catégories à chaque ouverture
// ...existing code...
}

// Amélioration de la gestion des événements de saisie
let searchTimeout = null;
itemTitleInput.addEventListener('input', () => {
const query = itemTitleInput.value.trim();

// Effacer le timeout précédent
if (searchTimeout) {
    clearTimeout(searchTimeout);
}

// Cacher les suggestions si la recherche est vide
if (!query) {
    mangaAutocomplete.style.display = 'none';
    return;
}

// Définir un nouveau timeout pour le debouncing
searchTimeout = setTimeout(async () => {
    try {
        const suggestions = await fetchMangaSuggestions(query);
        if (suggestions.length > 0) {
            handleAutocompleteSuggestions(suggestions);
        } else {
            mangaAutocomplete.style.display = 'none';
        }
    } catch (error) {
        console.error('Erreur lors de la recherche:', error);
        showToast('Erreur de recherche. Réessayez plus tard.', 'error');
        mangaAutocomplete.style.display = 'none';
    }
}, 500); // Attendre 500ms après la dernière frappe
});

// Amélioration de l'affichage des suggestions
function showAutocompleteSuggestions(items) {
mangaAutocomplete.innerHTML = '';

if (!items.length) {
    mangaAutocomplete.style.display = 'none';
    return;
}

items.forEach(item => {
    const suggestionDiv = document.createElement('div');
    suggestionDiv.className = 'autocomplete-item';
    
    const imageUrl = item.images?.jpg?.image_url || '';
    const title = item.title || 'Sans titre';
    
    suggestionDiv.innerHTML = `
        <div class="suggestion-content">
            ${imageUrl ? `<img src="${imageUrl}" alt="" loading="lazy" />` : ''}
            <span class="suggestion-title">${title}</span>
        </div>
    `;
    
    suggestionDiv.addEventListener('click', () => selectManga(item));
    mangaAutocomplete.appendChild(suggestionDiv);
});

mangaAutocomplete.style.display = 'block';
}

// Gestionnaire pour la génération d'URL
document.getElementById('generate-url-btn').addEventListener('click', () => {
  // Récupération du slug, de la catégorie et du numéro de chapitre depuis le DOM
  const slug = document.getElementById('manga-slug').value.trim();
  const cat = document.getElementById('item-type').value;
  // const chapter = parseInt(document.getElementById('itemChapInput').value, 10) || 1;
  
  // Vérifier que le slug est renseigné
  if (!slug) {
    showToast('Veuillez entrer un slug', 'warning');
    return;
  }
  
  // Vérifier que la catégorie est sélectionnée
  if (!cat) {
    showToast('Veuillez sélectionner une catégorie', 'warning');
    return;
  }
  
  // Génération de l'URL via la fonction dédiée
  const url = createAnimeSamaLink(slug, chapter, cat);
  document.getElementById('item-url').value = url;
  showToast('URL générée avec succès', 'success');
});

/**
 * Fonction pour créer un lien vers Anime-Sama en fonction du slug, du chapitre et de la catégorie.
 *
 * Si la catégorie est "anime", le segment utilisé sera "saison1", sinon "scan" pour "manga".
 *
 * Exemple d'URL :
 * - Pour un anime : https://anime-sama.fr/catalogue/mushoku-tensei/saison1/vf/chapitre-5
 * - Pour un manga : https://anime-sama.fr/catalogue/mushoku-tensei/scan/vf/chapitre-5
 *
 * @param {string} title - Le slug dynamique du manga/anime.
 * @param {number|string} chapter - Le numéro du chapitre.
 * @param {string} category - La catégorie ("anime" ou "manga").
 * @returns {string} L'URL générée.
 */
function createAnimeSamaLink(title, chapter, category) {
  const chapterStr = String(chapter);
  // Définir le segment selon la catégorie
  const segment = (category === 'anime') ? 'saison1' : 'scan';
  return `https://anime-sama.fr/catalogue/${title}`;
  ///${segment}/vf/chapitre-${chapterStr}`;
}

// Ajouter cette nouvelle fonction après les autres fonctions
const handleKeyPress = async (e) => {
  if (e.key === 'Delete' && selectedCard) {
      const itemId = selectedCard.dataset.itemId;
      if (itemId) {
          await deleteItem(itemId);
          renderList(getCurrentFilter());
      }
  }
};

// ...rest of existing code...

// Add this function before the event listeners
function selectManga(manga) {
    if (!manga) return;
    
    itemTitleInput.value = manga.title;
    if (manga.images?.jpg?.image_url) {
        itemCoverInput.value = manga.images.jpg.image_url;
        coverPreviewImg.src = manga.images.jpg.image_url;
        coverPreviewImg.style.display = 'block';
    }
    mangaAutocomplete.style.display = 'none';
}

// ...rest of existing code...
