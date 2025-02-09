#!/usr/bin/env python3
import re
import json
import time
import logging
from urllib.parse import quote_plus

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

# Identifiant utilisateur par défaut
DEFAULT_USER_ID = "a339f3fe-d3ea-43f8-b9db-b3dabd2ef405"

# Création d'une session avec gestion automatique des retries
session = requests.Session()
retry_strategy = Retry(
    total=5,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["HEAD", "GET", "OPTIONS"],
    backoff_factor=1
)
adapter = HTTPAdapter(max_retries=retry_strategy)
session.mount("http://", adapter)
session.mount("https://", adapter)

def get_read_url(title, item_type):
    """
    Génère une URL permettant de lire ou de visionner le manga/anime en se basant sur le titre.
      - Pour les Anime, on propose une recherche sur MyAnimeList.
      - Pour les Manga, une recherche sur MangaDex.
    Le titre est URL-encodé.
    """
    encoded_title = quote_plus(title)
    if item_type == "Anime":
        return f"https://myanimelist.net/anime.php?q={encoded_title}"
    elif item_type == "Manga":
        return f"https://mangadex.org/search?title={encoded_title}"
    else:
        return ""

def determine_type(line):
    """
    Détermine le type d'item en se basant sur la présence de "(film)" ou "ep".
      - Si la ligne contient "(film)" ou "ep" → "Anime"
      - Sinon → "Manga"
    """
    lower_line = line.lower()
    if "(film)" in lower_line or "ep" in lower_line:
        return "Anime"
    else:
        return "Manga"

def extract_chapters(line):
    """
    Extrait le nombre de chapitres/épisodes lus indiqué dans la ligne.
    Exemple : "Code geass (50 ep)" renvoie 50.
    """
    match = re.search(r"\((\d+)\s*(chap|ep)", line, re.IGNORECASE)
    if match:
        return int(match.group(1))
    return 0

def fetch_info(title, item_type):
    """
    Interroge l'API Jikan pour récupérer :
      - Le nombre total d'épisodes (pour Anime/film) ou de chapitres (pour Manga)
      - La liste des tags (issus des champs genres, themes, demographics)
      - L'URL de la couverture (privilégiant l'image haute résolution)
      - Le titre officiel (si disponible)
      - L'URL de la page officielle (mais non utilisée pour la lecture)
    
    Deux tentatives sont effectuées (la seconde en retirant les chiffres de fin du titre si nécessaire).
    En cas d'échec, des valeurs par défaut sont retournées.
    """
    if item_type == "Anime":
        base_url = "https://api.jikan.moe/v4/anime"
        params = {"q": title, "type": "anime"}
    elif item_type == "Manga":
        base_url = "https://api.jikan.moe/v4/manga"
        params = {"q": title, "type": "manga"}
    else:
        logging.warning(f"Type non reconnu pour '{title}', retour par défaut.")
        return {"total": 0, "tags": [], "cover": "", "api_title": "", "api_url": ""}

    headers = {"User-Agent": "Mozilla/5.0 (compatible; MyMangaClient/1.0)"}

    def perform_request(query_params):
        try:
            logging.info(f"Requête pour '{title}' avec params {query_params}")
            response = session.get(base_url, params=query_params, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data
        except requests.exceptions.RequestException as e:
            logging.error(f"Erreur réseau pour '{title}': {e}")
        except Exception as e:
            logging.error(f"Erreur inattendue pour '{title}': {e}")
        return None

    def extract_data(data):
        if data and "data" in data and len(data["data"]) > 0:
            result = data["data"][0]
            # Récupération du total d'épisodes ou de chapitres
            if item_type == "Anime":
                total = result.get("episodes", 0) or 0
            else:
                total = result.get("chapters", 0) or 0
            # Extraction des tags
            tags = []
            for key in ["genres", "themes", "demographics"]:
                for tag_item in result.get(key, []):
                    tag = tag_item.get("name", "")
                    if tag:
                        tags.append(tag)
            tags = list(set(tags))
            # Récupération de l'URL de couverture (privilégie l'image haute résolution)
            cover = result.get("images", {}).get("jpg", {}).get("large_image_url") \
                    or result.get("images", {}).get("jpg", {}).get("image_url", "")
            # Récupération du titre officiel et de l'URL de la page officielle (pour information)
            api_title = result.get("title", "")
            api_url = result.get("url", "")
            return total, tags, cover, api_title, api_url
        return None, None, None, None, None

    # Première tentative avec le titre initial
    data_response = perform_request(params)
    total, tags, cover, api_title, api_url = extract_data(data_response) if data_response else (None, None, None, None, None)
    if total is not None:
        logging.info(f"Infos récupérées pour '{title}': total={total}, tags={tags}, cover={cover}")
        return {"total": total, "tags": tags, "cover": cover, "api_title": api_title, "api_url": api_url}

    # Tentative alternative : retirer les chiffres en fin de titre
    alt_title = re.sub(r"\s*\d+$", "", title).strip()
    if alt_title and alt_title != title:
        logging.info(f"Tentative alternative pour '{title}' avec '{alt_title}'")
        params_alt = {"q": alt_title, "type": "anime" if item_type == "Anime" else "manga"}
        data_response = perform_request(params_alt)
        total, tags, cover, api_title, api_url = extract_data(data_response) if data_response else (None, None, None, None, None)
        if total is not None:
            logging.info(f"Infos (alternative) pour '{title}' via '{alt_title}': total={total}, tags={tags}, cover={cover}")
            return {"total": total, "tags": tags, "cover": cover, "api_title": api_title, "api_url": api_url}

    logging.error(f"Échec de la récupération pour '{title}'. Valeurs par défaut appliquées.")
    return {"total": 0, "tags": [], "cover": "", "api_title": "", "api_url": ""}

def parse_status(line):
    """
    Détermine le statut de la série :
      - "En cours" si la ligne contient l'emoji 🔛
      - "Terminé" sinon.
    """
    return "En cours" if "🔛" in line else "Terminé"

def extract_title(line):
    """
    Extrait un titre "nettoyé" pour la recherche en retirant :
      - Le marqueur initial ("✓" ou "◦")
      - Les indications entre parenthèses (ex: "(50 ep)", "(660 chap)", "(film)")
      - Les emojis et symboles de validation (ex: "✅", "🔛", "🔜", "🔚", "🀄️")
    """
    title = line.strip()
    if title.startswith("✓") or title.startswith("◦"):
        title = title[1:].strip()
    title = re.sub(r"\(\s*\d+\s*(chap|ep)\s*\)", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\(\s*film\s*\)", "", title, flags=re.IGNORECASE)
    title = re.sub(r"[\s✅🔛🔜🔚🀄️]+$", "", title)
    return title.strip()

def compute_score(line):
    """
    Calcule la note à partir du nombre d'emojis "✅".
    La note démarre à 5 et chaque "✅" ajoute 1.25 point.
    La note est arrondie à l'entier le plus proche.
    """
    count = line.count("✅")
    score = round(5 + count * 1.25)
    return score

def main():
    data = """
✓ Naruto ✅ ✅ 
✓ Dragon ball z ✅✅
✓ Bleach ✅✅
✓ One piece ✅
✓ Yu yu hakusho (ep86)
✓ Black clover ✅✅
✓ My hero academia ✅
✓ Vagabond ✅ ✅
✓ Noblesse ✅✅
✓ Berserk ✅✅
✓ Kingdom (660 chap)✅
✓ Pun pun(120 chap)✅✅
✓ Attack on titan (139 chap)✅✅
✓ Chainsaw man (120 chap)✅
✓ Code geass (50 ep)✅✅
✓ Toaru s1 (25 ep)✅
✓ Fate zero (25 ep)✅✅
✓ Fate UBW (25 ep)✅✅
✓ No game no life (13 ep)✅
✓ Haikyu ✅✅
✓ Mushoku tensei ✅
✓ Solo leveling ✅✅
✓ One punch man (130 chap)✅
✓ Tower of god ✅
✓ Blue lock (130 chap)✅
✓ God of high school
✓ Gurren Lagan ✅✅
✓ Gurren Lagan movie ✅✅✅✅
✓ Gurren lagann movie ✅✅
✓ The climber ✅✅
✓ Jujutsu kaisen (150 chap)✅
✓ JoJo no Kimyō na Bōken 1 ✅✅
✓ JoJo no Kimyō na Bōken 2 ✅✅
✓ JoJo no Kimyō na Bōken 3 ✅✅
✓ JoJo no Kimyō na Bōken 4 ✅✅
✓ JoJo no Kimyō na Bōken 5 ✅✅
✓ JoJo no Kimyō na Bōken 6 ✅✅
✓ JoJo no Kimyō na Bōken 7 ✅✅
✓ JoJo no Kimyō na Bōken 8 ✅✅
✓ Your name (film)✅✅
✓ A silent voice (film)✅✅
✓ I wanna eat your pancreas (film)✅✅
✓ Howls castle (film)✅✅
✓ Château dans le ciel (film)✅✅
✓ Totoro (film)✅✅
✓ Princesse mononoke (film)✅✅
✓ Grave of the fireflies (film)✅✅
✓ Blade of the strangers (film)✅✅
✓ Hunter x hunter (139 ep)✅✅
✓ Assassination classroom (50 ep)✅✅
✓ Ping pong the animation (11 ep)✅✅
✓ Devil man cry baby (10 ep)✅✅
✓ Tokyo ghoul ✅✅
✓ Tokyo ghoul re ✅✅
✓ That time I got reincarnated as a slime ✅✅
✓ Made in abyss ✅✅
✓ Sao (60 ep)✅🀄️
✓ Fairy tail ✅✅
✓ Dororo (25 ep)✅✅
✓ Full metal (50 ep)✅✅
✓ Kaiju no 8 (30 chap)✅
✓ Record of ragnarok (50 chap)✅
✓ Baki ✅
✓ Hajime no ippo ✅
✓ Blue exorcist s1(13 ep) ✅✅
✓ Magi s1(13 ep)✅✅
✓ Parasite (25 ep)✅✅
✓ Inazuma eleven ✅✅
✓ Pokémon ✅✅
✓ Great teacher onizuka (130 chap)✅✅
✓ Bungo stray dogs ✅✅
✓ Banana fish (25 ep)✅✅
✓ Samurai champloo (26 ep)✅✅
✓ Cowboy bebop (25 ep)✅✅
✓ Mob psycho 100 (26 ep)✅
✓ Vinland saga (190 chap)✅
✓ Seven deadly sins ✅✅
✓ Death note (37 ep)✅✅
✓ Death note (one shot)✅✅
✓ 20th century boys ✅✅
✓ Monster ✅✅
✓ Noblesse (545 chap)✅✅
✓ Demon slayer (200 chap)✅✅
✓ Slam dunk (278 chap)✅✅
✓ Real ✅✅
✓ The promised neverland (130 chap)✅🀄️🔛
✓ Prison school (12 ep)✅✅
✓ Overlord s1✅✅
✓ Arietty (film)✅✅
✓ Voyage de chihiro (film)✅✅
✓ Bakuon retto ✅✅
✓ Dorehodoro ✅✅
✓ Hells paradise ✅✅
✓ The boxer (72 chap)✅✅
✓ Tokyo revengers (203 chap)✅
✓ Wind breaker ✅
✓ Omnisciencent reader ✅
◦ Vanitas ✅
✓ The horizon ✅✅ (21 chap)
✓ Rikudou ✅
✓ Innocent
✓ Ajin ✅
✓ Black torch ✅✅
✓ Rainbow✅✅
✓ Blue period ✅
✓ Sun Ken rock ✅✅
✓ Ranking of kings ✅
✓ Sakamoto days ✅
✓ Classroom of the elite ✅
✓ My dress up darling ✅✅
✓ Sabikui bisco ✅✅
✓ Homonculus ✅✅
✓ Ayashimon ✅
✓ Tbate ✅
✓ Steins gate ✅✅
✓ Dai dark ✅
✓ Re zero ✅
✓ Three days of happiness ✅✅
✓ Bakuon retto ✅✅
✓ Alice in hell ✅✅
✓ Gachiakuta ✅
✓ D gray man ✅
✓ Dandadan✅
✓ Hideout ✅✅
✓ All you need is kill ✅✅
✓ Bestarius✅✅
✓ What do you wish for with these murky eyes ✅
✓ 86 ✅✅
✓ Love is war ✅
✓ Evangelion ✅✅
✓ Hellsing ✅
✓ Devoro ✅
✓ Juujita no kire ✅
✓ Tenkaichi ✅
✓ Kotaro en solo ✅✅
✓ Summer time rendering ✅✅
✓ Cyberpunk edgerunners ✅✅
✓ Akira
✓ Dr stone ✅
◦ Kengen ashura
◦ Origin
✓ Jagaan
✓ Great pretender 🔛
◦ Eleceed 🔜
◦ Magi
◦ Green blood🔜
✓ Planete 🔜
◦ Trigun 🔜
✓ Eye shield 21
◦ Akatsuki no yona 🔛
◦ Flcl 🔛
◦ World trigger 🔛
✓ Usogui
✓ Zetman 🔜
✓ Soul eater🔜
◦ Saiki 🔚
◦ Durarara 🔚
◦ To your eternity 🔚
◦ Fire punch 🔛
✓ Gantz 🔚
◦ Blame 🔛
✓ Terror in resonnance 🔛
◦ Claymore 🔚
✓ Gangsta
◦ Gunm🔛
◦ Her summon 🔛
◦ The four knights of the apocalypse 🔜
✓ CoQ de combat (shamo)🔜
◦ Akumetsu 🔜
◦ Air gear 🔜
◦ Crow 🔛
◦ Out 🔜
◦ Hollyland 🔚
◦ I am a hero 🔛
◦ Battle royale 🔜
◦ Sugarless
✓ Beastars 🔜
✓ Alice in borderlands 🔜
◦ Pluto 🔜
◦ Billy bat 🔜
◦ Erased
◦ Shield hero
◦ The breaker
◦ Tomodachi game
◦ Psyren
◦ Ripper
◦ Aliens area
◦ Crazy food truck
◦ The world is mine
◦ Yomotsuhegui
◦ Our happy time
◦ Hikari no go
◦ Ao ashi
◦ Orient samurai quest
✓ Kurogane no valhalian
✓ Sonny boy
◦ No guns life 😈😈
✓ The boy and the beast
✓ Kiichi
◦ Kiichi vs
◦ Bakemonogatari
◦ Radiant
◦ Tokyo underworld
◦ Dead man wonderland
✓ Rikudo
◦ Dddddestruction
◦ Route 20
◦ Rookies
◦ Freesia
◦ Prisonnier riku
✓ Flowers of evil
◦ The fable
◦ Sangetsu no lion
◦ Boys abyss
✓ Houseki no kuni
◦ Nausica
◦ The eminence in shadow
◦ We did it
◦ Ravages of time
◦ 91 days
◦ Blade of the immortal
◦ Freesia
✓ Zetman
◦ Tsugumomo
✓ The flowers of evil
◦ Terra formars
✓ Eden !!!
◦ Reborn
✓ Soul ea
◦ Kurosawa ter !!!!
◦ Billy bat
◦ Golden kamuy
◦ Darker than black
◦ Batuque!!!
◦ The killer inside
◦ Shut hell
✓ Heaven desilusion
✓ Oshi no ko
◦ Helper
◦ Helk
◦ Kenshin
◦ Bacano
◦ A-bout
◦ Kiichi vs
◦ Ravage of time 🥵🥵🥵🥵
◦ The world is mine
◦ Crows
◦ Takemizu zamurai
    """

    myList = []
    # Traitement de chaque ligne
    for idx, line in enumerate(data.splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            extracted_title = extract_title(line)
            item_type = determine_type(line)
            chapters_read = extract_chapters(line)
            info = fetch_info(extracted_title, item_type)
            total = info.get("total", 0)
            tags = info.get("tags", [])
            cover = info.get("cover", "")
            api_title = info.get("api_title", "")
            # On utilise le titre officiel si disponible
            title = api_title if api_title else extracted_title

            # Si le statut n'est pas "En cours" et aucun nombre n'est précisé, on considère que l'intégralité a été lue
            if parse_status(line) != "En cours" and chapters_read == 0:
                chapters_read = total

            notes = ""
            if total == 0 and not tags:
                notes = "A verifier"

            score = compute_score(line)
            is_fav = score > 8

            # Génération de l'URL de lecture/visionnage en fonction du type et du titre
            read_url = get_read_url(title, item_type)

            item = {
                "id": f"item_{idx+1}",
                "user_id": DEFAULT_USER_ID,
                "type": item_type,
                "title": title,
                "cover": cover,
                "chapter": chapters_read,
                "total": total,
                "status": parse_status(line),
                "score": score,
                "url": read_url,
                "is_fav": is_fav,
                "notes": notes,
                "start_date": None,
                "end_date": None,
                "tags": tags,
                "updated_at": "2024-02-01T00:00:00Z"
            }
            myList.append(item)
            logging.info(f"Item traité : {title}")
        except Exception as e:
            logging.exception(f"Erreur lors du traitement de la ligne '{line}': {e}")
            # Ajout d'un item avec des valeurs par défaut en cas d'erreur
            item = {
                "id": f"item_{len(myList)+1}",
                "user_id": DEFAULT_USER_ID,
                "type": "Unknown",
                "title": extracted_title if extracted_title else line,
                "cover": "",
                "chapter": 0,
                "total": 0,
                "status": "Erreur",
                "score": 0,
                "url": "",
                "is_fav": False,
                "notes": "Erreur de traitement",
                "start_date": None,
                "end_date": None,
                "tags": [],
                "updated_at": "2024-02-01T00:00:00Z"
            }
            myList.append(item)

    categories = ["Manga", "Manhwa/Manhua", "Anime", "Light Novel"]
    final_data = {
        "myList": myList,
        "categories": categories
    }
    try:
        with open("output.json", "w", encoding="utf-8") as f:
            json.dump(final_data, f, ensure_ascii=False, indent=4)
        logging.info("Les données ont été sauvegardées dans output.json")
    except Exception as e:
        logging.error(f"Erreur lors de l'écriture du fichier output.json: {e}")

if __name__ == "__main__":
    main()
