# My Bookshelf

A beautiful web application to track and manage your reading list.

## Features

- 📚 View all your books in a beautiful card-based layout
- 📅 Track reading dates and see statistics
- ⭐ Rate books from 0 to 5 stars
- 🔍 Search books by title, author, description, or review
- 🏷️ Filter books by category (스리픽, 북클럽)
- 📊 Sort books by date, rating, or title
- ➕ Add new books directly from the web interface
- 💾 All data stored in CSV format
- 🍑 Share Instagram-style reading snippets in **스리의 독서피드**
- ❤️ Curate friend recommendations in **좋은 책 같이 읽기**

## Setup

1. Activate the conda environment:
```bash
conda activate bookshelf
```

2. Install dependencies (if not already installed):
```bash
pip install -r requirements.txt
```

3. Run the application:
```bash
python app.py
```

4. Open your browser and navigate to:
```
http://localhost:5000
```

## Data Format

The application reads from `static/data/books.csv` with the following columns:
- `title`: Book title
- `author`: Author name
- `category`: Category (스리픽 or 북클럽)
- `read_date`: Date read (YYYY-MM-DD format)
- `description`: Book description
- `rating`: Rating from 0 to 5
- `review`: One-line review
- `cover_image`: Optional URL or uploaded image path

The CSV file under `static/data/books.csv` is the single source of truth.  
The Flask app reads/writes directly to this file, and GitHub Pages now loads it too.  
When you need the JSON artifacts (for backup or tooling), use the “Export for GitHub Pages” button to regenerate `static/data/books.json` and `stats.json` from the CSV.

### Reading Feed Data

The 독서피드 tab stores entries in `static/data/feed.json` with:
- `id`: Unique entry identifier
- `caption`: Text content
- `image_url`: Uploaded image path (optional)
- `mood_tags`: Array of hashtags (chip-based input)
- `created_at`: ISO timestamp (auto-generated)

The 추천 탭 stores cards in `static/data/recommendations.json`:
- `id`: Unique identifier
- `recommender_name`, `profile_image`, `title`, `reason`
- `books`: Array (max 3) of `{ title, author, description, cover_image }`
- `created_at` / `updated_at`

Entries are authored on localhost only. After posting, click **Export Feed Data** (or the global export button) and commit/push `static/data/feed.json` so GitHub Pages can display the updated feed.
## Usage

- **Search**: Type in the search box to filter books
- **Filter**: Select a category from the dropdown
- **Sort**: Choose sorting option and order (ascending/descending)
- **Add Book**: Click "Add New Book" button to add a new entry
- **Reading Feed**: Switch to the 🍑 스리의 독서피드 tab, upload an image + caption, and click “게시하기” (localhost only). Use the export button beside the form to regenerate static data.
- **Recommendations**: Use the ❤️ 좋은 책 같이 읽기 tab to register recommender info and up to 3 titles (localhost). Export afterward to refresh `static/data/recommendations.json`.
- All changes are automatically saved to `static/data/books.csv`
