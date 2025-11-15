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
## Usage

- **Search**: Type in the search box to filter books
- **Filter**: Select a category from the dropdown
- **Sort**: Choose sorting option and order (ascending/descending)
- **Add Book**: Click "Add New Book" button to add a new entry
- All changes are automatically saved to `static/data/books.csv`
