from flask import Flask, render_template, request, jsonify, send_from_directory
import pandas as pd
import os
import requests
import re
import uuid
import json
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
CSV_FILE = 'sri_books_2025.csv'
SUMMARY_FILE = 'year_end_summary.json'
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Create upload folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

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
    if os.path.exists(CSV_FILE):
        df = pd.read_csv(CSV_FILE, encoding='utf-8-sig')
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
            
            # Convert NaN to empty string
            for key in book:
                if pd.isna(book[key]):
                    book[key] = ''
            
            # Parse Korean date format
            if book.get('read_date'):
                parsed_date = parse_korean_date(book['read_date'])
                if parsed_date:
                    book['read_date'] = parsed_date.strftime('%Y-%m-%d')
        
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
        books_to_save.append(book_copy)
    
    df = pd.DataFrame(books_to_save)
    # Ensure all expected columns exist
    expected_columns = ['title', 'author', 'category', 'read_date', 'description', 'rating', 'review', 'cover_image']
    for col in expected_columns:
        if col not in df.columns:
            df[col] = ''
    
    df.to_csv(CSV_FILE, index=False, encoding='utf-8-sig')

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
    
    result = {'cover_url': None, 'author': None}
    
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
    
    return jsonify({
        'current_date': current_date,
        'current_year_count': current_year_count
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
        # Generate unique filename
        filename = str(uuid.uuid4()) + '.' + file.filename.rsplit('.', 1)[1].lower()
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        # Return URL to access the file
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
        
        # Remove internal fields
        books_clean = []
        for book in books:
            book_copy = book.copy()
            book_copy.pop('_index', None)
            books_clean.append(book_copy)
        
        # Save to static/data/books.json
        os.makedirs('static/data', exist_ok=True)
        with open('static/data/books.json', 'w', encoding='utf-8') as f:
            json.dump(books_clean, f, ensure_ascii=False, indent=2)
        
        # Export stats
        current_year_count = get_current_year_count(books)
        current_date = datetime.now().strftime('%Y년 %m월 %d일')
        stats = {
            'current_date': current_date,
            'current_year_count': current_year_count
        }
        with open('static/data/stats.json', 'w', encoding='utf-8') as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
        
        # Export year-end summary
        summary = load_summary()
        with open('static/data/summary.json', 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        return jsonify({'success': True, 'message': 'Static data exported successfully'})
    except Exception as e:
        print(f"Error exporting static data: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)

