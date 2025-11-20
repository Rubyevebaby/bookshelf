from flask import Flask, render_template, request, jsonify, send_from_directory
import pandas as pd
import os
import requests
import re
import uuid
import json
import shutil
import io
from datetime import datetime
from werkzeug.utils import secure_filename
HEIC_SUPPORTED = False
try:
    from PIL import Image
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
    except Exception:
        pass
    HEIC_SUPPORTED = True
except ImportError:
    Image = None

app = Flask(__name__)
CSV_FILE = 'static/data/books.csv'
LEGACY_CSV_FILE = 'sri_books_2025.csv'
SUMMARY_FILE = 'year_end_summary.json'
FEED_FILE = 'static/data/feed.json'
RECOMMENDATIONS_FILE = 'static/data/recommendations.json'
ABOUT_FILE = 'static/data/about.json'
WISHLIST_FILE = 'static/data/wishlist.json'
WISHLIST_STATUSES = ['시작 전', '읽는 중', '완독']
AVERAGE_CHAR_PER_PAGE = 700
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'}

# Create upload folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.dirname(CSV_FILE), exist_ok=True)
os.makedirs(os.path.dirname(FEED_FILE), exist_ok=True)
os.makedirs(os.path.dirname(RECOMMENDATIONS_FILE), exist_ok=True)
os.makedirs(os.path.dirname(ABOUT_FILE), exist_ok=True)
os.makedirs(os.path.dirname(WISHLIST_FILE), exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def ensure_books_csv_exists():
    """Ensure the primary books CSV exists (migrating from legacy if necessary)."""
    if os.path.exists(CSV_FILE):
        return CSV_FILE
    if os.path.exists(LEGACY_CSV_FILE):
        shutil.copy(LEGACY_CSV_FILE, CSV_FILE)
        return CSV_FILE
    # Initialize empty CSV with required columns
    columns = ['title', 'author', 'category', 'read_date', 'description', 'rating', 'review', 'cover_image']
    pd.DataFrame(columns=columns).to_csv(CSV_FILE, index=False, encoding='utf-8-sig')
    return CSV_FILE

def normalize_read_date(date_value):
    """Normalize assorted date formats to YYYY-MM-DD string."""
    if date_value is None or (isinstance(date_value, float) and pd.isna(date_value)):
        return ''
    date_str = str(date_value).strip()
    if not date_str:
        return ''
    # Try pandas parser first
    try:
        parsed = pd.to_datetime(date_str, errors='coerce', dayfirst=False)
        if pd.notna(parsed):
            return parsed.strftime('%Y-%m-%d')
    except Exception:
        pass
    # Try Korean date style
    parsed_korean = parse_korean_date(date_str)
    if parsed_korean:
        return parsed_korean.strftime('%Y-%m-%d')
    # Try manual MM/DD/YY parsing
    slash_match = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})$', date_str)
    if slash_match:
        month = int(slash_match.group(1))
        day = int(slash_match.group(2))
        year = int(slash_match.group(3))
        if year < 100:
            year += 2000
        return f"{year:04d}-{month:02d}-{day:02d}"
    return date_str

def normalize_page_count(value):
    if value is None or value == '' or (isinstance(value, float) and pd.isna(value)):
        return 0
    try:
        return int(float(value))
    except:
        return 0

def enrich_book_metadata(book, metadata_cache=None):
    """Fill missing author/cover_image fields using external book APIs."""
    if not book:
        return book
    title = str(book.get('title', '')).strip()
    if not title:
        return book
    metadata_cache = metadata_cache if metadata_cache is not None else {}
    author_value = str(book.get('author', '') or '').strip()
    cover_value = str(book.get('cover_image', '') or '').strip()
    needs_author = author_value == ''
    needs_cover = cover_value == ''
    if not (needs_author or needs_cover):
        return book
    cache_key = (title.lower(), author_value.lower())
    if cache_key not in metadata_cache:
        metadata_cache[cache_key] = get_book_info(title, author_value)
    info = metadata_cache.get(cache_key, {})
    if needs_author and info.get('author'):
        book['author'] = info['author']
    if needs_cover and info.get('cover_url'):
        book['cover_image'] = info['cover_url']
    if not book.get('page_count') and info.get('page_count'):
        book['page_count'] = info['page_count']
    return book

def ensure_page_count(book, metadata_cache=None):
    if book.get('page_count'):
        return False
    metadata_cache = metadata_cache if metadata_cache is not None else {}
    title = str(book.get('title', '')).strip()
    if not title:
        return False
    key = (title.lower(), str(book.get('author', '') or '').lower())
    if key not in metadata_cache:
        metadata_cache[key] = get_book_info(title, book.get('author', ''))
    info = metadata_cache.get(key, {})
    if info.get('page_count'):
        book['page_count'] = info['page_count']
        return True
    return False

def parse_korean_date(date_str):
    """Parse Korean date format like '2025 1월' to datetime"""
    if not date_str or pd.isna(date_str):
        return None
    
    date_str = str(date_str).strip()
    # Match pattern like "2025 1월", "2025 2월"
    match = re.match(r'(\d{4})\s*(\d{1,2})월', date_str)
    if match:
        year = int(match.group(1))
        month = int(match.group(2))
        # Set day to 1st of the month
        return datetime(year, month, 1)
    return None

def load_books():
    """Load books from CSV file"""
    csv_path = ensure_books_csv_exists()
    if os.path.exists(csv_path):
        df = pd.read_csv(csv_path, encoding='utf-8-sig')
        # Remove first row if it contains metadata
        if len(df) > 0:
            first_row = df.iloc[0]
            # Check if first row looks like metadata (has empty title or special characters)
            if pd.isna(first_row.get('title')) or '최상단' in str(first_row.get('title', '')):
                df = df.iloc[1:].reset_index(drop=True)
        
        books = df.to_dict('records')
        # Clean up empty values and convert date format
        for i, book in enumerate(books):
            # Add index for identification
            book['_index'] = i
            
            # Ensure cover_image field exists
            if 'cover_image' not in book:
                book['cover_image'] = ''
            if 'page_count' not in book:
                book['page_count'] = 0
            
            # Convert NaN to empty string
            for key in book:
                if pd.isna(book[key]):
                    book[key] = ''
            
            # Parse Korean date format
            if book.get('read_date'):
                normalized = normalize_read_date(book['read_date'])
                if normalized:
                    book['read_date'] = normalized
            book['page_count'] = normalize_page_count(book.get('page_count', 0))
        
        return books
    return []

def save_books(books):
    """Save books to CSV file"""
    # Remove internal fields before saving
    books_to_save = []
    for book in books:
        book_copy = book.copy()
        book_copy.pop('_index', None)
        # Ensure cover_image field exists (default to empty string if not present)
        if 'cover_image' not in book_copy:
            book_copy['cover_image'] = ''
        if 'page_count' in book_copy:
            book_copy['page_count'] = normalize_page_count(book_copy.get('page_count', 0))
        books_to_save.append(book_copy)
    
    df = pd.DataFrame(books_to_save)
    # Ensure all expected columns exist
    expected_columns = ['title', 'author', 'category', 'read_date', 'description', 'rating', 'review', 'cover_image', 'page_count']
    for col in expected_columns:
        if col not in df.columns:
            df[col] = ''
    
    os.makedirs(os.path.dirname(CSV_FILE), exist_ok=True)
    df.to_csv(CSV_FILE, index=False, encoding='utf-8-sig')
    # Keep legacy file in sync if it exists
    if os.path.exists(LEGACY_CSV_FILE):
        df.to_csv(LEGACY_CSV_FILE, index=False, encoding='utf-8-sig')

def get_current_year_count(books):
    """Get count of books read in current year"""
    current_year = datetime.now().year
    count = 0
    for book in books:
        if book.get('read_date'):
            try:
                # Try parsing as standard date format first
                read_date = pd.to_datetime(book['read_date'], errors='coerce')
                if pd.notna(read_date) and read_date.year == current_year:
                    count += 1
                else:
                    # Try Korean date format
                    parsed_date = parse_korean_date(book['read_date'])
                    if parsed_date and parsed_date.year == current_year:
                        count += 1
            except:
                pass
    return count

def get_book_info(title, author=''):
    """Get book information (cover URL and author) from Google Books API"""
    if not title:
        return {'cover_url': None, 'author': None}
    
    result = {'cover_url': None, 'author': None, 'page_count': None}
    
    # Try Google Books API first
    try:
        # Use intitle search for better matching with Korean books
        # Try multiple query strategies for better results
        queries = []
        
        # Strategy 1: intitle search (most accurate for Korean books)
        queries.append(f'intitle:"{title}"')
        
        # Strategy 2: title + author if available
        if author and author.strip():
            queries.append(f'intitle:"{title}" inauthor:"{author}"')
            queries.append(f'"{title}" "{author}"')
        
        # Strategy 3: general search
        queries.append(title)
        if author and author.strip():
            queries.append(f'{title} {author}')
        
        print(f"Searching Google Books API for: {title}")
        
        # Try each query strategy
        for query in queries:
            try:
                items = []
                # Try with langRestrict first, then without if no results
                for lang_restrict in ['ko', None]:
                    params = {'q': query, 'maxResults': 10}
                    if lang_restrict:
                        params['langRestrict'] = lang_restrict
                    
                    response = requests.get(
                        'https://www.googleapis.com/books/v1/volumes',
                        params=params,
                        timeout=10
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        items = data.get('items', [])
                        
                        if items:
                            print(f"Google Books API returned {len(items)} results for query: {query}")
                            
                            # Try to find the best match with image
                            for item in items:
                                volume_info = item.get('volumeInfo', {})
                                item_title = volume_info.get('title', '').strip()
                                image_links = volume_info.get('imageLinks', {})
                                authors = volume_info.get('authors', [])
                                
                                # Check if title matches (fuzzy match for Korean books)
                                title_match = False
                                if item_title.lower() == title.lower():
                                    title_match = True
                                elif title in item_title or item_title in title:
                                    title_match = True
                                
                                # Page count
                                if result['page_count'] is None and volume_info.get('pageCount'):
                                    try:
                                        result['page_count'] = int(volume_info.get('pageCount'))
                                    except:
                                        pass
                                # Get author if not provided
                                if not result['author'] and authors and len(authors) > 0:
                                    result['author'] = ', '.join(authors)
                                
                                # Get cover image (prioritize items with images)
                                if image_links and not result['cover_url']:
                                    # Try different image sizes (prefer larger, higher quality)
                                    for size in ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail']:
                                        if size in image_links:
                                            url = image_links[size]
                                            # Try to get higher quality by modifying URL
                                            # Replace zoom=1 with zoom=0 for original size, or use larger size
                                            if 'zoom=1' in url:
                                                url = url.replace('zoom=1', 'zoom=0')
                                            elif '&zoom=1' in url:
                                                url = url.replace('&zoom=1', '&zoom=0')
                                            
                                            # Use https if available
                                            if url.startswith('http://'):
                                                url = url.replace('http://', 'https://', 1)
                                            
                                            print(f"Found cover image: {url}")
                                            result['cover_url'] = url
                                            
                                            # If we have both cover and author, return immediately
                                            if result['cover_url'] and result['author']:
                                                return result
                                            # If we found cover with title match, return it
                                            if title_match and result['cover_url']:
                                                return result
                                            break
                                
                                # If we found a good match with cover, return it
                                if title_match and result['cover_url']:
                                    return result
                            
                            # If we found cover, return it immediately
                            if result['cover_url']:
                                return result
                            # If we found author but no cover, continue to next query
                            if result['author'] and not result['cover_url']:
                                break
                    
                    elif response.status_code != 200:
                        if not lang_restrict:  # Only print error for the last attempt
                            print(f"Google Books API returned status code: {response.status_code} for query: {query}")
                        continue
                    
                    # If we got results, don't try without langRestrict
                    if items:
                        break
                    
            except requests.exceptions.Timeout:
                print(f"Timeout for query: {query}")
                continue
            except Exception as e:
                print(f"Error with query '{query}': {e}")
                continue
        
        # If we have author but no cover, try Open Library with ISBN from last successful query
        if result['author'] and not result['cover_url']:
            try:
                response = requests.get(
                    'https://www.googleapis.com/books/v1/volumes',
                    params={'q': f'intitle:"{title}"', 'maxResults': 5},
                    timeout=10
                )
                if response.status_code == 200:
                    data = response.json()
                    items = data.get('items', [])
                    for item in items:
                        volume_info = item.get('volumeInfo', {})
                        isbn_list = volume_info.get('industryIdentifiers', [])
                        for identifier in isbn_list:
                            isbn = None
                            if identifier.get('type') == 'ISBN_13':
                                isbn = identifier.get('identifier')
                            elif identifier.get('type') == 'ISBN_10':
                                isbn = identifier.get('identifier')
                            
                            if isbn:
                                openlib_url = f'https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg'
                                # Verify the image exists
                                try:
                                    img_check = requests.head(openlib_url, timeout=3)
                                    if img_check.status_code == 200:
                                        print(f"Found Open Library cover: {openlib_url}")
                                        result['cover_url'] = openlib_url
                                        return result
                                except:
                                    pass
            except:
                pass
        
        # Return what we found (even if incomplete)
        if result['author'] or result['cover_url']:
            return result
            
    except Exception as e:
        print(f"Error in get_book_info: {e}")
        import traceback
        traceback.print_exc()
    
    return result

def get_book_cover(title, author=''):
    """Get book cover image URL using Google Books API and Open Library as fallback"""
    info = get_book_info(title, author)
    return info.get('cover_url')

@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/api/books', methods=['GET'])
def get_books():
    """Get all books with optional filtering and sorting"""
    books = load_books()
    
    # Filtering
    category = request.args.get('category')
    if category:
        books = [b for b in books if b.get('category') == category]
    
    search = request.args.get('search', '').lower()
    if search:
        books = [b for b in books if 
                search in str(b.get('title', '')).lower() or 
                search in str(b.get('author', '')).lower() or
                search in str(b.get('description', '')).lower() or
                search in str(b.get('review', '')).lower()]
    
    # Sorting
    sort_by = request.args.get('sort', 'read_date')
    reverse = request.args.get('order', 'desc') == 'desc'
    
    if sort_by == 'read_date':
        def date_key(x):
            date_str = x.get('read_date', '')
            if not date_str:
                return datetime(1900, 1, 1)
            try:
                return pd.to_datetime(date_str, errors='coerce') or parse_korean_date(date_str) or datetime(1900, 1, 1)
            except:
                parsed = parse_korean_date(date_str)
                return parsed if parsed else datetime(1900, 1, 1)
        books.sort(key=date_key, reverse=reverse)
    elif sort_by == 'rating':
        books.sort(key=lambda x: float(x.get('rating', 0) or 0), reverse=reverse)
    elif sort_by == 'title':
        books.sort(key=lambda x: str(x.get('title', '')).lower(), reverse=reverse)
    
    return jsonify(books)

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get statistics"""
    books = load_books()
    current_year_count = get_current_year_count(books)
    current_date = datetime.now().strftime('%Y년 %m월 %d일')
    metadata_cache = {}
    save_needed = False
    for book in books:
        if ensure_page_count(book, metadata_cache):
            save_needed = True
    if save_needed:
        save_books(books)
    total_pages = sum(normalize_page_count(book.get('page_count', 0)) for book in books)
    months_elapsed = max(datetime.now().month, 1)
    monthly_average = round(current_year_count / months_elapsed, 2) if months_elapsed else 0
    total_characters = total_pages * AVERAGE_CHAR_PER_PAGE
    
    return jsonify({
        'current_date': current_date,
        'current_year_count': current_year_count,
        'monthly_average': monthly_average,
        'total_pages': total_pages,
        'total_characters': total_characters
    })

@app.route('/api/books', methods=['POST'])
def add_book():
    """Add a new book"""
    books = load_books()
    
    new_book = {
        'title': request.json.get('title', ''),
        'author': request.json.get('author', ''),
        'category': request.json.get('category', ''),
        'read_date': request.json.get('read_date', ''),
        'description': request.json.get('description', ''),
        'rating': request.json.get('rating', 0),
        'review': request.json.get('review', ''),
        'cover_image': request.json.get('cover_image', '')
    }
    
    books.append(new_book)
    save_books(books)
    
    return jsonify({'success': True, 'book': new_book}), 201

@app.route('/api/books/<int:index>', methods=['PUT'])
def update_book(index):
    """Update an existing book"""
    books = load_books()
    
    if index < 0 or index >= len(books):
        return jsonify({'error': 'Book not found'}), 404
    
    updated_data = request.json
    for key in updated_data:
        if key in books[index]:
            books[index][key] = updated_data[key]
    
    save_books(books)
    
    return jsonify({'success': True, 'book': books[index]})

@app.route('/api/books/<int:index>', methods=['GET'])
def get_book(index):
    """Get a specific book by index"""
    books = load_books()
    
    if index < 0 or index >= len(books):
        return jsonify({'error': 'Book not found'}), 404
    
    return jsonify(books[index])

@app.route('/api/upload-cover', methods=['POST'])
def upload_cover():
    """Upload a book cover image"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        original_ext = file.filename.rsplit('.', 1)[1].lower()
        unique_name = str(uuid.uuid4())
        filename = ''
        filepath = ''
        try:
            file.stream.seek(0)
            file_bytes = file.read()
            if not file_bytes:
                return jsonify({'error': '빈 파일입니다.'}), 400
            
            if original_ext in {'heic', 'heif'}:
                if not HEIC_SUPPORTED or Image is None:
                    return jsonify({'error': 'HEIC 이미지를 처리할 수 없습니다. JPG 등으로 변환한 뒤 업로드해주세요.'}), 400
                filename = f'{unique_name}.jpg'
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                image = Image.open(io.BytesIO(file_bytes))
                image = image.convert('RGB')
                image.save(filepath, format='JPEG', quality=90)
            else:
                filename = f'{unique_name}.{original_ext}'
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                with open(filepath, 'wb') as f:
                    f.write(file_bytes)
        except Exception as e:
            print(f"Error saving upload: {e}")
            return jsonify({'error': '이미지 저장 중 오류가 발생했습니다.'}), 500
        
        return jsonify({'success': True, 'url': f'/static/uploads/{filename}'})
    
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/static/uploads/<filename>')
def uploaded_file(filename):
    """Serve uploaded files"""
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/api/cover', methods=['GET'])
def get_cover():
    """Get book cover image URL"""
    title = request.args.get('title', '')
    author = request.args.get('author', '')
    
    if not title:
        return jsonify({'cover_url': None}), 400
    
    try:
        cover_url = get_book_cover(title, author)
        print(f"Cover URL for '{title}': {cover_url}")
        return jsonify({'cover_url': cover_url})
    except Exception as e:
        print(f"Error getting cover for '{title}': {e}")
        return jsonify({'cover_url': None})

@app.route('/api/book-info', methods=['GET'])
def get_book_info_endpoint():
    """Get book information (cover URL and author)"""
    title = request.args.get('title', '')
    author = request.args.get('author', '')
    
    if not title:
        return jsonify({'cover_url': None, 'author': None}), 400
    
    try:
        info = get_book_info(title, author)
        print(f"Book info for '{title}': {info}")
        return jsonify(info)
    except Exception as e:
        print(f"Error getting book info for '{title}': {e}")
        return jsonify({'cover_url': None, 'author': None})

def load_summary():
    """Load year-end summary from JSON file"""
    if os.path.exists(SUMMARY_FILE):
        try:
            with open(SUMMARY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_summary(summary_data):
    """Save year-end summary to JSON file"""
    with open(SUMMARY_FILE, 'w', encoding='utf-8') as f:
        json.dump(summary_data, f, ensure_ascii=False, indent=2)

def load_feed_entries():
    """Load reading feed entries"""
    if os.path.exists(FEED_FILE):
        try:
            with open(FEED_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    normalized_entries = []
                    changed = False
                    for entry in data:
                        if 'mood_tags' not in entry or not isinstance(entry.get('mood_tags'), list):
                            migrated = normalize_mood_tags(entry.get('mood', entry.get('mood_tags', [])))
                            entry['mood_tags'] = migrated
                            changed = True
                        normalized_entries.append(entry)
                    if changed:
                        save_feed_entries(normalized_entries)
                    return normalized_entries
        except:
            pass
    return []

def save_feed_entries(entries):
    """Persist reading feed entries"""
    os.makedirs(os.path.dirname(FEED_FILE), exist_ok=True)
    with open(FEED_FILE, 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

def normalize_mood_tags(value):
    """Ensure mood tags stored as clean list of unique strings"""
    tags = []
    if isinstance(value, list):
        tags = value
    elif isinstance(value, str):
        tags = [tag.strip() for tag in re.split(r'[,\s]+', value) if tag.strip()]
    if not tags:
        return []
    normalized = []
    seen = set()
    for tag in tags:
        clean = tag.strip().lstrip('#')
        if not clean:
            continue
        if clean.lower() not in seen:
            seen.add(clean.lower())
            normalized.append(clean)
    return normalized

def load_recommendations():
    """Load recommendation entries"""
    if os.path.exists(RECOMMENDATIONS_FILE):
        try:
            with open(RECOMMENDATIONS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except:
            pass
    return []

def save_recommendations(entries):
    """Persist recommendations"""
    os.makedirs(os.path.dirname(RECOMMENDATIONS_FILE), exist_ok=True)
    with open(RECOMMENDATIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

def load_wishlist():
    """Load wishlist entries from JSON file"""
    if os.path.exists(WISHLIST_FILE):
        try:
            with open(WISHLIST_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception:
            pass
    return []

def save_wishlist(entries):
    """Persist wishlist entries"""
    os.makedirs(os.path.dirname(WISHLIST_FILE), exist_ok=True)
    with open(WISHLIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

def normalize_recommendation_books(books):
    """Ensure books field contains up to 3 structured entries"""
    normalized = []
    if not books:
        return normalized
    for book in books:
        if len(normalized) >= 3:
            break
        if not isinstance(book, dict):
            continue
        normalized.append({
            'title': str(book.get('title', '') or '').strip(),
            'author': str(book.get('author', '') or '').strip(),
            'cover_image': str(book.get('cover_image', '') or '').strip(),
            'description': str(book.get('description', '') or '').strip()
        })
    return normalized

def load_about_data():
    if os.path.exists(ABOUT_FILE):
        try:
            with open(ABOUT_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except:
            pass
    return {
        'profile_image': '',
        'title': '안녕하세요, 스리입니다 👋',
        'description': '책을 읽고 기록하며 느낀 점들을 이곳에 차곡차곡 쌓고 있어요.',
        'highlights': [
            '요즘 관심사: 감정의 언어, 여성 서사, 생각의 단단함을 길러주는 인문서',
            '읽고 싶은 순간: 새벽 한잔의 커피와 함께 혹은 센치한 퇴근길에'
        ]
    }

def save_about_data(data):
    os.makedirs(os.path.dirname(ABOUT_FILE), exist_ok=True)
    with open(ABOUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route('/api/year-end-summary', methods=['GET'])
def get_year_end_summary():
    """Get year-end summary"""
    summary = load_summary()
    return jsonify(summary)

@app.route('/api/year-end-summary', methods=['POST'])
def save_year_end_summary():
    """Save year-end summary"""
    try:
        summary_data = request.json
        save_summary(summary_data)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error saving summary: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/wishlist', methods=['GET'])
def get_wishlist_entries():
    """Return wishlist entries"""
    entries = load_wishlist()
    return jsonify(entries)

@app.route('/api/wishlist', methods=['POST'])
def add_wishlist_entry():
    """Create a new wishlist entry"""
    try:
        data = request.json or {}
        title = str(data.get('title', '') or '').strip()
        if not title:
            return jsonify({'success': False, 'error': '책 제목을 입력해주세요.'}), 400
        reason = str(data.get('reason', '') or '').strip()
        status = str(data.get('status', WISHLIST_STATUSES[0]) or '').strip()
        if status not in WISHLIST_STATUSES:
            status = WISHLIST_STATUSES[0]
        cover_image = str(data.get('cover_image', '') or '').strip()
        
        entry = {
            'id': str(uuid.uuid4()),
            'title': title,
            'reason': reason,
            'status': status,
            'cover_image': cover_image,
            'created_at': datetime.utcnow().isoformat() + 'Z'
        }
        entries = load_wishlist()
        entries.insert(0, entry)
        save_wishlist(entries)
        return jsonify({'success': True, 'entry': entry})
    except Exception as e:
        print(f"Error adding wishlist entry: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/wishlist/<entry_id>', methods=['PUT'])
def update_wishlist_entry(entry_id):
    """Update an existing wishlist entry"""
    try:
        data = request.json or {}
        entries = load_wishlist()
        updated_entry = None
        for entry in entries:
            if entry.get('id') == entry_id:
                if 'title' in data:
                    title = str(data.get('title', '') or '').strip()
                    if title:
                        entry['title'] = title
                if 'reason' in data:
                    entry['reason'] = str(data.get('reason', '') or '').strip()
                if 'status' in data:
                    status = str(data.get('status', '') or '').strip()
                    if status in WISHLIST_STATUSES:
                        entry['status'] = status
                if 'cover_image' in data:
                    entry['cover_image'] = str(data.get('cover_image', '') or '').strip()
                updated_entry = entry
                break
        if updated_entry is None:
            return jsonify({'success': False, 'error': '항목을 찾을 수 없습니다.'}), 404
        save_wishlist(entries)
        return jsonify({'success': True, 'entry': updated_entry})
    except Exception as e:
        print(f"Error updating wishlist entry: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/wishlist/<entry_id>', methods=['DELETE'])
def delete_wishlist_entry(entry_id):
    """Delete a wishlist entry"""
    try:
        entries = load_wishlist()
        new_entries = [entry for entry in entries if entry.get('id') != entry_id]
        if len(new_entries) == len(entries):
            return jsonify({'success': False, 'error': '항목을 찾을 수 없습니다.'}), 404
        save_wishlist(new_entries)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error deleting wishlist entry: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/feed', methods=['GET'])
def get_reading_feed():
    """Return reading feed entries"""
    feed_entries = load_feed_entries()
    # Sort newest first
    feed_entries.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify(feed_entries)

@app.route('/api/feed', methods=['POST'])
def add_reading_feed_entry():
    """Create a new reading feed entry"""
    try:
        data = request.json or {}
        caption = str(data.get('caption', '') or '').strip()
        image_url = str(data.get('image_url', '') or '').strip()
        mood_tags = normalize_mood_tags(data.get('mood_tags', []))
        if not caption and not image_url:
            return jsonify({'success': False, 'error': '내용 또는 이미지를 입력해주세요.'}), 400
        feed_entries = load_feed_entries()
        entry = {
            'id': str(uuid.uuid4()),
            'caption': caption,
            'image_url': image_url,
            'mood_tags': mood_tags,
            'created_at': datetime.now().isoformat()
        }
        feed_entries.append(entry)
        save_feed_entries(feed_entries)
        return jsonify({'success': True, 'entry': entry}), 201
    except Exception as e:
        print(f"Error saving feed entry: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/feed/<entry_id>', methods=['PUT'])
def update_reading_feed_entry(entry_id):
    """Update an existing reading feed entry"""
    try:
        data = request.json or {}
        feed_entries = load_feed_entries()
        updated = None
        for entry in feed_entries:
            if entry.get('id') == entry_id:
                entry['caption'] = str(data.get('caption', '') or '').strip()
                entry['mood_tags'] = normalize_mood_tags(data.get('mood_tags', entry.get('mood_tags', [])))
                entry['image_url'] = str(data.get('image_url', '') or '').strip()
                entry['updated_at'] = datetime.now().isoformat()
                if not entry.get('created_at'):
                    entry['created_at'] = entry['updated_at']
                updated = entry
                break
        if updated is None:
            return jsonify({'success': False, 'error': 'Feed entry not found'}), 404
        save_feed_entries(feed_entries)
        return jsonify({'success': True, 'entry': updated})
    except Exception as e:
        print(f"Error updating feed entry: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/feed/<entry_id>', methods=['DELETE'])
def delete_reading_feed_entry(entry_id):
    """Delete a reading feed entry"""
    try:
        feed_entries = load_feed_entries()
        new_entries = [entry for entry in feed_entries if entry.get('id') != entry_id]
        if len(new_entries) == len(feed_entries):
            return jsonify({'success': False, 'error': 'Feed entry not found'}), 404
        save_feed_entries(new_entries)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error deleting feed entry: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/recommendations', methods=['GET'])
def get_recommendations():
    """Return recommendation entries"""
    entries = load_recommendations()
    return jsonify(entries)

@app.route('/api/recommendations', methods=['POST'])
def add_recommendation():
    try:
        data = request.json or {}
        recommender_name = str(data.get('recommender_name', '') or '').strip()
        profile_image = str(data.get('profile_image', '') or '').strip()
        title_text = str(data.get('title', '') or '').strip()
        reason = str(data.get('reason', '') or '').strip()
        books = normalize_recommendation_books(data.get('books', []))
        if not recommender_name:
            return jsonify({'success': False, 'error': '추천인 이름을 입력해주세요.'}), 400
        entry = {
            'id': str(uuid.uuid4()),
            'recommender_name': recommender_name,
            'profile_image': profile_image,
            'title': title_text,
            'reason': reason,
            'books': books,
            'created_at': datetime.now().isoformat()
        }
        entries = load_recommendations()
        entries.append(entry)
        save_recommendations(entries)
        return jsonify({'success': True, 'entry': entry}), 201
    except Exception as e:
        print(f"Error adding recommendation: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/recommendations/<entry_id>', methods=['PUT'])
def update_recommendation(entry_id):
    try:
        data = request.json or {}
        entries = load_recommendations()
        updated = None
        for entry in entries:
            if entry.get('id') == entry_id:
                entry['recommender_name'] = str(data.get('recommender_name', entry.get('recommender_name', '')) or '').strip()
                entry['profile_image'] = str(data.get('profile_image', entry.get('profile_image', '')) or '').strip()
                entry['title'] = str(data.get('title', entry.get('title', '')) or '').strip()
                entry['reason'] = str(data.get('reason', entry.get('reason', '')) or '').strip()
                entry['books'] = normalize_recommendation_books(data.get('books', entry.get('books', [])))
                entry['updated_at'] = datetime.now().isoformat()
                if not entry.get('created_at'):
                    entry['created_at'] = entry['updated_at']
                updated = entry
                break
        if not updated:
            return jsonify({'success': False, 'error': 'Recommendation not found'}), 404
        save_recommendations(entries)
        return jsonify({'success': True, 'entry': updated})
    except Exception as e:
        print(f"Error updating recommendation: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/recommendations/<entry_id>', methods=['DELETE'])
def delete_recommendation(entry_id):
    try:
        entries = load_recommendations()
        new_entries = [entry for entry in entries if entry.get('id') != entry_id]
        if len(new_entries) == len(entries):
            return jsonify({'success': False, 'error': 'Recommendation not found'}), 404
        save_recommendations(new_entries)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error deleting recommendation: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/recommendations/<entry_id>/move', methods=['POST'])
def move_recommendation(entry_id):
    """Move recommendation entry up or down"""
    try:
        direction = request.json.get('direction')
        entries = load_recommendations()
        index = next((i for i, entry in enumerate(entries) if entry.get('id') == entry_id), None)
        if index is None:
            return jsonify({'success': False, 'error': 'Recommendation not found'}), 404
        if direction == 'up' and index > 0:
            entries[index - 1], entries[index] = entries[index], entries[index - 1]
            save_recommendations(entries)
        elif direction == 'down' and index < len(entries) - 1:
            entries[index + 1], entries[index] = entries[index], entries[index + 1]
            save_recommendations(entries)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error moving recommendation: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/about', methods=['GET'])
def get_about():
    return jsonify(load_about_data())

@app.route('/api/about', methods=['POST'])
def save_about():
    try:
        data = request.json or {}
        about = load_about_data()
        about['title'] = str(data.get('title', about.get('title', '')) or '').strip()
        about['description'] = str(data.get('description', about.get('description', '')) or '').strip()
        about['profile_image'] = str(data.get('profile_image', about.get('profile_image', '')) or '').strip()
        highlights = data.get('highlights', about.get('highlights', []))
        if isinstance(highlights, list):
            about['highlights'] = [str(item).strip() for item in highlights if str(item).strip()]
        save_about_data(about)
        return jsonify({'success': True, 'about': about})
    except Exception as e:
        print(f"Error saving about data: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/books/current-year', methods=['GET'])
def get_current_year_books():
    """Get all books read in current year"""
    books = load_books()
    current_year = datetime.now().year
    
    current_year_books = []
    for book in books:
        if book.get('read_date'):
            try:
                read_date = pd.to_datetime(book['read_date'], errors='coerce')
                if pd.notna(read_date) and read_date.year == current_year:
                    current_year_books.append(book)
                else:
                    parsed_date = parse_korean_date(book['read_date'])
                    if parsed_date and parsed_date.year == current_year:
                        current_year_books.append(book)
            except:
                pass
    
    return jsonify(current_year_books)

@app.route('/api/export-static', methods=['POST'])
def export_static_data():
    """Export all data to static JSON files for GitHub Pages"""
    try:
        # Load books from CSV
        books = load_books()
        metadata_cache = {}
        
        # Remove internal fields and unwanted fields
        books_clean = []
        unwanted_fields = ['_index', 'Unnamed: 7', 'Unnamed: 8', '최상단에 지금 날짜와 (연월일) + 올해부터 읽은 책 권수를 하이라이트 해줘야함']
        
        for book in books:
            book_copy = {}
            # Only keep valid book fields
            valid_fields = ['title', 'author', 'category', 'read_date', 'description', 'rating', 'review', 'cover_image', 'page_count']
            for field in valid_fields:
                if field in book:
                    if field == 'page_count':
                        book_copy[field] = normalize_page_count(book.get(field, 0))
                    else:
                        book_copy[field] = book[field]
            # Fill metadata such as author and cover image before saving
            enrich_book_metadata(book_copy, metadata_cache)
            books_clean.append(book_copy)
        
        # Save to static/data/books.json
        os.makedirs('static/data', exist_ok=True)
        with open('static/data/books.json', 'w', encoding='utf-8') as f:
            json.dump(books_clean, f, ensure_ascii=False, indent=2)
        
        # Also export CSV representation for bulk uploads
        books_df = pd.DataFrame(books_clean)
        csv_columns = ['title', 'author', 'category', 'read_date', 'description', 'rating', 'review', 'cover_image', 'page_count']
        for col in csv_columns:
            if col not in books_df.columns:
                books_df[col] = ''
        books_df = books_df[csv_columns]
        books_df.to_csv(CSV_FILE, index=False, encoding='utf-8-sig')
        
        # Export stats
        metadata_cache = {}
        save_needed = False
        for book in books:
            if ensure_page_count(book, metadata_cache):
                save_needed = True
        if save_needed:
            save_books(books)
        current_year_count = get_current_year_count(books)
        current_date = datetime.now().strftime('%Y년 %m월 %d일')
        total_pages = sum(normalize_page_count(book.get('page_count', 0)) for book in books)
        months_elapsed = max(datetime.now().month, 1)
        monthly_average = round(current_year_count / months_elapsed, 2)
        total_characters = total_pages * AVERAGE_CHAR_PER_PAGE
        stats = {
            'current_date': current_date,
            'current_year_count': current_year_count,
            'monthly_average': monthly_average,
            'total_pages': total_pages,
            'total_characters': total_characters
        }
        with open('static/data/stats.json', 'w', encoding='utf-8') as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
        
        # Export year-end summary
        summary = load_summary()
        with open('static/data/summary.json', 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        # Export reading feed
        feed_entries = load_feed_entries()
        with open(FEED_FILE, 'w', encoding='utf-8') as f:
            json.dump(feed_entries, f, ensure_ascii=False, indent=2)
        
        # Export recommendations
        recommendations = load_recommendations()
        with open(RECOMMENDATIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(recommendations, f, ensure_ascii=False, indent=2)
        about = load_about_data()
        with open(ABOUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(about, f, ensure_ascii=False, indent=2)
        wishlist_entries = load_wishlist()
        with open(WISHLIST_FILE, 'w', encoding='utf-8') as f:
            json.dump(wishlist_entries, f, ensure_ascii=False, indent=2)
        
        return jsonify({'success': True, 'message': 'Static data exported successfully'})
    except Exception as e:
        print(f"Error exporting static data: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
