import { showToast } from './utils.js';

const SUPABASE_URL = 'https://wjzydlxjkprzsvmptnfx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqenlkbHhqa3ByenN2bXB0bmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg0MjIzNzYsImV4cCI6MjA1Mzk5ODM3Nn0.mh1WB4aEQ1wXIwAUK4Aj4ecOgvYIvgel1-YGqUdCxBs';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
});

let currentUser = null;
let categories = [];
let myList = [];

const checkAuth = async () => {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (!user) {
            window.location.href = 'login.html';
            return false;
        }
        currentUser = user;
        return true;
    } catch (error) {
        console.error('Erreur d\'authentification:', error);
        window.location.href = 'login.html';
        return false;
    }
};

const handleLogout = async () => {
    try {
        await supabase.auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Erreur de déconnexion:', error);
    }
};

// Ajoutez au début du script, après la déclaration de supabase
// Déplacer les déclarations de variables globales ici
let navRight = null;
let signOutBtn = null;

// Fonction utilitaire pour gérer les erreurs API
async function handleApiRequest(apiCall) {
    try {
        const response = await apiCall();
        if (response.error) throw response.error;
        return response.data;
    } catch (error) {
        console.error('Erreur API:', error);
        showToast('Erreur de connexion à l\'API. Utilisation du mode local.', 'error');
        return null;
    }
}

// Déplacer les fonctions de gestion des catégories ici
const loadCategories = async () => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('name')
      .eq('user_id', currentUser.id);

    if (error) throw error;

    categories = data?.map(cat => cat.name) || [];
    
    // Si aucune catégorie n'existe, créer les catégories par défaut
    if (categories.length === 0) {
      const defaultCategories = ["Manga", "Manhwa/Manhua", "Anime", "Light Novel"];
      for (const cat of defaultCategories) {
        await addCategory(cat);
      }
    }

    // Remove UI-related function calls
    return categories;
  } catch (error) {
    console.error('Erreur de chargement des catégories:', error);
    showToast('Erreur de chargement des catégories', 'error');
    throw error;
  }
};

const saveCategories = async () => {
  try {
    // Supprimer les anciennes catégories
    await supabase
      .from('categories')
      .delete()
      .eq('user_id', currentUser.id);

    // Insérer les nouvelles
    const { error } = await supabase
      .from('categories')
      .insert(
        categories.map(name => ({
          user_id: currentUser.id,
          name: name
        }))
      );

    if (error) throw error;
  } catch (error) {
    console.error('Erreur de sauvegarde des catégories:', error);
    showToast('Erreur de sauvegarde des catégories', 'error');
  }
};

// Fonction pour ajouter une catégorie
const addCategory = async (categoryName) => {
  try {
    if (!categoryName || categoryName.trim() === "") {
      return { error: "Le nom de la catégorie est requis." };
    }

    categoryName = categoryName.trim();

    // Vérifier si la catégorie existe déjà (insensible à la casse)
    if (categories.some(cat => cat.toLowerCase() === categoryName.toLowerCase())) {
      return { error: "Cette catégorie existe déjà." };
    }

    const { data, error } = await supabase
      .from('categories')
      .insert([{ 
        user_id: currentUser.id,
        name: categoryName 
      }]);

    if (error) throw error;

    // Ajouter la catégorie à la liste locale
    categories.push(categoryName);

    return { data: categoryName };

  } catch (error) {
    console.error('Erreur d\'ajout de catégorie:', error);
    return { error: 'Erreur lors de l\'ajout de la catégorie' };
  }
};

// Fonction pour supprimer une catégorie
const deleteCategory = async (categoryName) => {
  try {
    // Vérifier si la catégorie est utilisée
    const { data: items } = await supabase
      .from('items')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('type', categoryName);

    if (items && items.length > 0) {
      return { 
        error: `Impossible de supprimer : ${items.length} élément(s) utilisent cette catégorie.`,
        type: "warning" 
      };
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('name', categoryName);

    if (error) throw error;

    // Mettre à jour la liste locale
    categories = categories.filter(cat => cat !== categoryName);
    
    return { success: true, message: `Catégorie "${categoryName}" supprimée.` };
  } catch (error) {
    console.error('Erreur de suppression de catégorie:', error);
    return { error: 'Erreur lors de la suppression de la catégorie', type: "error" };
  }
};

// Modifier les fonctions de gestion des items
const loadItems = async () => {
  try {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('user_id', currentUser.id);

    if (error) throw error;

    myList = data || [];
  } catch (error) {
    console.error('Erreur de chargement des items:', error);
    showToast('Erreur de chargement des items', 'error');
  }
};

const saveItems = async () => {
  try {
    const itemsToSave = myList.map(item => ({
      user_id: currentUser.id,
      type: item.type,
      title: item.title,
      cover: item.cover,
      chapter: item.chapter,
      total: item.total || 0,
      status: item.status,
      score: item.score || 0,
      url: item.url,
      is_fav: item.isFav, // Changé de isFav à is_fav
      notes: item.notes,
      start_date: item.startDate, // Changé de startDate à start_date
      end_date: item.endDate,     // Changé de endDate à end_date
      tags: item.tags || [],
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('items')
      .upsert(itemsToSave);

    if (error) throw error;
  } catch (error) {
    console.error('Erreur de sauvegarde:', error);
    showToast('Erreur de sauvegarde', 'error');
  }
};

const addItem = async (item) => {
  try {
    // Vérification des doublons
    const duplicate = myList.find(it =>
      it.title.toLowerCase() === item.title.toLowerCase() &&
      it.type === item.type
    );

    if (duplicate) {
      showToast(`L'élément "${item.title}" existe déjà dans la catégorie "${item.type}".`, "warning");
      return;
    }

    const newItem = {
      ...item,
      user_id: currentUser.id,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('items')
      .insert([newItem]);

    if (error) throw error;

    myList.push(newItem);
    showToast(`Élément "${item.title}" ajouté.`, "success");
  } catch (error) {
    console.error('Erreur d\'ajout:', error);
    showToast('Erreur lors de l\'ajout', 'error');
  }
};

const updateItem = async (updated) => {
  try {
    updated.user_id = currentUser.id;
    updated.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('items')
      .update(updated)
      .eq('id', updated.id)
      .eq('user_id', currentUser.id);

    if (error) throw error;

    const idx = myList.findIndex(it => it.id === updated.id);
    if (idx !== -1) {
      myList[idx] = updated;
      showToast(`Élément "${updated.title}" mis à jour.`, "success");
    }
  } catch (error) {
    console.error('Erreur de mise à jour:', error);
    showToast('Erreur lors de la mise à jour', 'error');
  }
};

const deleteItem = async (id) => {
  try {
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUser.id);

    if (error) throw error;

    const item = myList.find(it => it.id === id);
    if (item) {
      myList = myList.filter(it => it.id !== id);
      showToast(`Élément "${item.title}" supprimé.`, "success");
    }
  } catch (error) {
    console.error('Erreur de suppression:', error);
    showToast('Erreur lors de la suppression', 'error');
  }
};

// Pour l'import/export
const importDataFromJSON = async (file) => {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const obj = JSON.parse(e.target.result);
      if (obj.myList && obj.categories) {
        // Importer les catégories
        categories = obj.categories;
        await saveCategories();

        // Importer les items
        const itemsToImport = obj.myList.map(item => ({
          ...item,
          user_id: currentUser.id,
          updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
          .from('items')
          .upsert(itemsToImport);

        if (error) throw error;

        await loadItems(); // Recharger les items
        renderList(getCurrentFilter());
        showToast('Import réussi !', 'success');
      }
    } catch (error) {
      console.error('Erreur d\'import:', error);
      showToast('Erreur lors de l\'import', 'error');
    }
  };
  reader.readAsText(file);
};

// Déplacer l'initialisation du bouton de déconnexion dans une fonction
const initNavigation = () => {
  navRight = document.querySelector('.nav-right .nav-section');
  if (navRight) {
    signOutBtn = document.createElement('button');
    signOutBtn.className = 'icon-btn';
    signOutBtn.innerHTML = '🚪 Déconnexion';
    signOutBtn.onclick = handleLogout;
    navRight.appendChild(signOutBtn);
  }
};

// Remove UI-related code from main initialization
document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (!await checkAuth()) return;

        // Only keep Supabase-related initialization
        initNavigation();

    } catch (error) {
        console.error('Erreur d\'initialisation:', error);
        showToast('Erreur lors de l\'initialisation de l\'application', 'error');
    }
});

// Export only defined functions/variables
export {
    supabase,
    currentUser,
    checkAuth,
    handleLogout,
    addCategory,
    deleteCategory,
    addItem,
    updateItem,
    deleteItem,
    importDataFromJSON,
    loadCategories,
    saveCategories,
    loadItems,
    saveItems,
    showToast,
    handleApiRequest,
    initNavigation,
    categories,
    myList
};