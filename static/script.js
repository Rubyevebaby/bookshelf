// Load books and stats on page load
document.addEventListener('DOMContentLoaded', function() {
    // 정적 모드일 때 UI 업데이트
    if (STATIC_MODE) {
        showReadOnlyBanner();
        disableWriteFeatures();
    }
    
    loadStats();
    loadBooks();
    
    // Event listeners
    document.getElementById('search-input').addEventListener('input', debounce(loadBooks, 300));
    document.getElementById('category-filter').addEventListener('change', loadBooks);
    document.getElementById('sort-select').addEventListener('change', loadBooks);
    document.getElementById('order-select').addEventListener('change', loadBooks);
    document.getElementById('add-book-btn').addEventListener('click', openModal);
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('add-book-form').addEventListener('submit', addBook);
    document.getElementById('close-edit-modal').addEventListener('click', closeEditModal);
    document.getElementById('cancel-edit-btn').addEventListener('click', closeEditModal);
    document.getElementById('edit-book-form').addEventListener('submit', updateBook);
    document.getElementById('save-summary-btn').addEventListener('click', saveYearEndSummary);
    
    // Initialize year-end summary
    initializeYearEndSummary();
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        const addModal = document.getElementById('add-book-modal');
        const editModal = document.getElementById('edit-book-modal');
        if (event.target === addModal) {
            closeModal();
        }
        if (event.target === editModal) {
            closeEditModal();
        }
    });
});

function resolveCoverImageUrl(coverImage) {
    if (!coverImage) return '';
    const trimmed = coverImage.trim();
    if (trimmed === '') return '';
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://') || trimmed.startsWith('data:')) {
        return trimmed;
    }
    let normalized = trimmed;
    if (normalized.startsWith('./')) {
        normalized = normalized.substring(2);
    }
    normalized = normalized.replace(/^\/+/, '');
    if (normalized === '') {
        return '';
    }
    if (STATIC_MODE) {
        return `${BASE_PATH}${normalized}`;
    }
    return `/${normalized}`;
}

// Update year display
function updateYearDisplay() {
    const currentYear = new Date().getFullYear();
    const yearEndTabText = document.getElementById('year-end-tab-text');
    const yearEndTitle = document.getElementById('year-end-title');
    
    if (yearEndTabText) {
        yearEndTabText.textContent = `🎊 ${currentYear} 연말 결산`;
    }
    if (yearEndTitle) {
        yearEndTitle.textContent = `🎊 ${currentYear} 연말 결산`;
    }
}

// Load statistics
async function loadStats() {
    updateYearDisplay();
    try {
        if (STATIC_MODE) {
            // 정적 모드: JSON 파일에서 로드하거나 클라이언트에서 계산
            const data = await loadStaticStats();
            // 올해 읽은 책 수는 loadBooks에서 계산됨
            document.getElementById('current-date').textContent = data.current_date;
            // year-count는 loadBooks 후에 업데이트됨
        } else {
            const response = await fetch(getApiUrl('api/stats'));
            const data = await response.json();
            document.getElementById('current-date').textContent = data.current_date;
            document.getElementById('year-count').textContent = data.current_year_count;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load books with filters
async function loadBooks() {
    try {
        const search = document.getElementById('search-input').value;
        const category = document.getElementById('category-filter').value;
        const sort = document.getElementById('sort-select').value;
        const order = document.getElementById('order-select').value;
        
        let books;
        if (STATIC_MODE) {
            // 정적 모드: JSON 파일에서 로드하고 클라이언트에서 필터링/정렬
            const allBooks = await loadStaticBooks();
            books = filterAndSortBooks(allBooks, search, category, sort, order);
            
            // 올해 읽은 책 수 계산
            const currentYearBooks = filterCurrentYearBooks(allBooks);
            document.getElementById('year-count').textContent = currentYearBooks.length;
        } else {
            // Flask 모드: 서버에서 필터링/정렬
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (category) params.append('category', category);
            if (sort) params.append('sort', sort);
            if (order) params.append('order', order);
            
            const response = await fetch(`${getApiUrl('api/books')}?${params.toString()}`);
            books = await response.json();
        }
        
        displayBooks(books);
        loadStats(); // Reload stats after loading books
    } catch (error) {
        console.error('Error loading books:', error);
    }
}

// Display books in grid
function displayBooks(books) {
    const grid = document.getElementById('books-grid');
    
    if (books.length === 0) {
        grid.innerHTML = '<div class="no-books">No books found. Add your first book!</div>';
        return;
    }
    
    grid.innerHTML = books.map((book, index) => `
        <div class="book-card" data-book-index="${book._index !== undefined ? book._index : index}">
            <div class="book-cover-container">
                <img class="book-cover" alt="${escapeHtml(book.title || 'Book cover')}" 
                     data-title="${escapeHtml(book.title || '')}" 
                     data-author="${escapeHtml(book.author || '')}"
                     data-cover-image="${escapeHtml(book.cover_image || '')}">
                <div class="book-cover-loading">Loading...</div>
            </div>
            <div class="book-info">
                <div class="book-title">${escapeHtml(book.title || 'Untitled')}</div>
                <div class="book-author">by ${escapeHtml(book.author || 'Unknown')}</div>
                <div class="book-category">${escapeHtml(book.category || '')}</div>
                <div class="book-rating">
                    <span class="stars">${getStars(book.rating)}</span>
                    <span class="rating-value">${book.rating || 0}</span>
                </div>
                <div class="book-date">Read on: ${formatDate(book.read_date)}</div>
                ${book.description ? `<div class="book-description">${escapeHtml(book.description)}</div>` : ''}
                ${book.review ? `<div class="book-review">"${escapeHtml(book.review)}"</div>` : ''}
                ${!STATIC_MODE ? `<button class="edit-book-btn" onclick="openEditModal(${book._index !== undefined ? book._index : index})">Edit</button>` : ''}
            </div>
        </div>
    `).join('');
    
    // Load book covers asynchronously
    loadBookCovers(books);
}

// Load book cover images
async function loadBookCovers(books) {
    const coverImages = document.querySelectorAll('.book-cover');
    
    coverImages.forEach(async (img, index) => {
        const title = img.getAttribute('data-title');
        const author = img.getAttribute('data-author');
        const coverImage = img.getAttribute('data-cover-image');
        const loadingDiv = img.parentElement.querySelector('.book-cover-loading');
        const bookCard = img.closest('.book-card');
        const authorElement = bookCard ? bookCard.querySelector('.book-author') : null;
        
        // Check if there's a manually uploaded cover image (must be non-empty)
        if (coverImage && coverImage.trim() !== '') {
            const resolvedCoverUrl = resolveCoverImageUrl(coverImage);
            if (resolvedCoverUrl) {
                img.src = resolvedCoverUrl;
            } else {
                // If normalization fails, fall back to API
                loadBookInfoFromAPI(img, title, loadingDiv, authorElement);
                return;
            }
            img.onload = function() {
                if (loadingDiv) loadingDiv.style.display = 'none';
                this.style.display = 'block';
            };
            img.onerror = function() {
                // If uploaded image fails, try API as fallback
                if (loadingDiv) loadingDiv.style.display = 'block';
                loadCoverFromAPI(img, title, author, loadingDiv, authorElement);
            };
            
            // Load author if missing
            if ((!author || author.trim() === '') && title) {
                loadAuthorFromAPI(title, authorElement);
            }
            return;
        }
        
        if (!title) {
            if (loadingDiv) loadingDiv.style.display = 'none';
            return;
        }
        
        // Load cover and author from API
        if (!author || author.trim() === '') {
            // Load both cover and author
            loadBookInfoFromAPI(img, title, loadingDiv, authorElement);
        } else {
            // Load only cover
            loadCoverFromAPI(img, title, author, loadingDiv, authorElement);
        }
    });
}

// Helper function to load book info (cover and author) from API
async function loadBookInfoFromAPI(img, title, loadingDiv, authorElement) {
    try {
        const params = new URLSearchParams({ title: title });
        const response = await fetch(`${getApiUrl('api/book-info')}?${params.toString()}`);
        const data = await response.json();
        
        console.log('Book info API response for', title, ':', data);
        
        // Update author if found
        if (data.author && data.author.trim() !== '' && authorElement) {
            authorElement.textContent = `by ${data.author}`;
        }
        
        // Load cover image
        if (data.cover_url && data.cover_url.trim() !== '') {
            img.onerror = function() {
                console.error('Image failed to load:', data.cover_url);
                if (loadingDiv) loadingDiv.style.display = 'none';
                this.style.display = 'none';
            };
            img.onload = function() {
                console.log('Image loaded successfully:', data.cover_url);
                if (loadingDiv) loadingDiv.style.display = 'none';
                this.style.display = 'block';
            };
            img.src = data.cover_url;
        } else {
            console.log('No cover URL found for', title);
            if (loadingDiv) loadingDiv.style.display = 'none';
            img.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading book info for', title, error);
        if (loadingDiv) loadingDiv.style.display = 'none';
        img.style.display = 'none';
    }
}

// Helper function to load author from API
async function loadAuthorFromAPI(title, authorElement) {
    if (!authorElement || !title) return;
    
    try {
        const params = new URLSearchParams({ title: title });
        const response = await fetch(`${getApiUrl('api/book-info')}?${params.toString()}`);
        const data = await response.json();
        
        if (data.author && data.author.trim() !== '') {
            authorElement.textContent = `by ${data.author}`;
            console.log('Author loaded for', title, ':', data.author);
        }
    } catch (error) {
        console.error('Error loading author for', title, error);
    }
}

// Helper function to load cover from API
async function loadCoverFromAPI(img, title, author, loadingDiv, authorElement) {
    try {
        const params = new URLSearchParams({ title: title });
        if (author && author.trim() !== '') {
            params.append('author', author);
        }
        
        const response = await fetch(`${getApiUrl('api/cover')}?${params.toString()}`);
        const data = await response.json();
        
        console.log('Cover API response for', title, ':', data);
        
        if (data.cover_url && data.cover_url.trim() !== '') {
            // Set up event handlers before setting src
            img.onerror = function() {
                console.error('Image failed to load:', data.cover_url);
                // If image fails to load, hide loading and keep placeholder
                if (loadingDiv) loadingDiv.style.display = 'none';
                this.style.display = 'none';
            };
            img.onload = function() {
                console.log('Image loaded successfully:', data.cover_url);
                if (loadingDiv) loadingDiv.style.display = 'none';
                this.style.display = 'block';
            };
            
            // Set src after handlers are set up
            img.src = data.cover_url;
        } else {
            // No cover found, hide loading
            console.log('No cover URL found for', title);
            if (loadingDiv) loadingDiv.style.display = 'none';
            img.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading cover for', title, error);
        if (loadingDiv) loadingDiv.style.display = 'none';
        img.style.display = 'none';
    }
}

// Get star rating display with HTML for half stars
function getStars(rating) {
    const numRating = parseFloat(rating) || 0;
    const fullStars = Math.floor(numRating);
    const hasHalfStar = numRating % 1 >= 0.5 && numRating % 1 < 1;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    let starsHTML = '';
    
    // Full stars
    for (let i = 0; i < fullStars; i++) {
        starsHTML += '<span class="star-full">★</span>';
    }
    
    // Half star
    if (hasHalfStar) {
        starsHTML += '<span class="star-half"><span class="star-half-left"></span><span class="star-half-right"></span></span>';
    }
    
    // Empty stars
    for (let i = 0; i < emptyStars; i++) {
        starsHTML += '<span class="star-empty">☆</span>';
    }
    
    return starsHTML;
}

// Format date (only year and month)
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    try {
        // Check if it's already in Korean format like "2025 1월"
        if (dateString.match(/^\d{4}\s*\d{1,2}월$/)) {
            return dateString.replace(/\s+/, '년 ');
        }
        
        const date = new Date(dateString);
        return date.toLocaleDateString('ko-KR', { 
            year: 'numeric', 
            month: 'long'
        });
    } catch (error) {
        // Try to parse as Korean format
        const koreanMatch = dateString.match(/^(\d{4})\s*(\d{1,2})월/);
        if (koreanMatch) {
            return `${koreanMatch[1]}년 ${koreanMatch[2]}월`;
        }
        return dateString;
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Modal functions
function openModal() {
    document.getElementById('add-book-modal').style.display = 'block';
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('book-date').value = today;
}

function closeModal() {
    document.getElementById('add-book-modal').style.display = 'none';
    document.getElementById('add-book-form').reset();
    const preview = document.getElementById('book-cover-preview');
    if (preview) {
        preview.style.display = 'none';
        preview.setAttribute('data-cover-url', '');
    }
}

// Add new book
async function addBook(event) {
    event.preventDefault();
    
    const coverImageUrl = document.getElementById('book-cover-preview')?.getAttribute('data-cover-url') || '';
    
    const bookData = {
        title: document.getElementById('book-title').value,
        author: document.getElementById('book-author').value,
        category: document.getElementById('book-category').value,
        read_date: document.getElementById('book-date').value,
        description: document.getElementById('book-description').value,
        rating: parseFloat(document.getElementById('book-rating').value),
        review: document.getElementById('book-review').value,
        cover_image: coverImageUrl
    };
    
    try {
        if (STATIC_MODE) {
            alert('정적 모드에서는 책을 추가할 수 없습니다.');
            return;
        }
        
        const response = await fetch(getApiUrl('api/books'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bookData)
        });
        
        if (response.ok) {
            closeModal();
            loadBooks();
            loadStats();
        } else {
            alert('Error adding book. Please try again.');
        }
    } catch (error) {
        console.error('Error adding book:', error);
        alert('Error adding book. Please try again.');
    }
}

// Open edit modal
async function openEditModal(index) {
    if (STATIC_MODE) {
        alert('정적 모드에서는 책을 수정할 수 없습니다.');
        return;
    }
    
    try {
        const response = await fetch(`${getApiUrl('api/books')}/${index}`);
        const book = await response.json();
        
        // Populate form
        document.getElementById('edit-book-title').value = book.title || '';
        document.getElementById('edit-book-author').value = book.author || '';
        document.getElementById('edit-book-category').value = book.category || '';
        document.getElementById('edit-book-date').value = book.read_date || '';
        document.getElementById('edit-book-description').value = book.description || '';
        document.getElementById('edit-book-rating').value = book.rating || 0;
        document.getElementById('edit-book-review').value = book.review || '';
        document.getElementById('edit-book-form').setAttribute('data-book-index', index);
        
        // Handle cover image
        const coverPreview = document.getElementById('edit-book-cover-preview');
        if (book.cover_image) {
            coverPreview.src = book.cover_image;
            coverPreview.style.display = 'block';
            coverPreview.setAttribute('data-cover-url', book.cover_image);
        } else {
            coverPreview.style.display = 'none';
            coverPreview.setAttribute('data-cover-url', '');
        }
        
        document.getElementById('edit-book-modal').style.display = 'block';
    } catch (error) {
        console.error('Error loading book:', error);
        alert('Error loading book. Please try again.');
    }
}

// Close edit modal
function closeEditModal() {
    document.getElementById('edit-book-modal').style.display = 'none';
    document.getElementById('edit-book-form').reset();
    const preview = document.getElementById('edit-book-cover-preview');
    if (preview) {
        preview.style.display = 'none';
        preview.setAttribute('data-cover-url', '');
    }
}

// Update book
async function updateBook(event) {
    event.preventDefault();
    
    const index = parseInt(document.getElementById('edit-book-form').getAttribute('data-book-index'));
    const coverImageUrl = document.getElementById('edit-book-cover-preview')?.getAttribute('data-cover-url') || '';
    
    const bookData = {
        title: document.getElementById('edit-book-title').value,
        author: document.getElementById('edit-book-author').value,
        category: document.getElementById('edit-book-category').value,
        read_date: document.getElementById('edit-book-date').value,
        description: document.getElementById('edit-book-description').value,
        rating: parseFloat(document.getElementById('edit-book-rating').value),
        review: document.getElementById('edit-book-review').value,
        cover_image: coverImageUrl
    };
    
    try {
        if (STATIC_MODE) {
            alert('정적 모드에서는 책을 수정할 수 없습니다.');
            return;
        }
        
        const response = await fetch(`${getApiUrl('api/books')}/${index}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bookData)
        });
        
        if (response.ok) {
            closeEditModal();
            loadBooks();
            loadStats();
        } else {
            alert('Error updating book. Please try again.');
        }
    } catch (error) {
        console.error('Error updating book:', error);
        alert('Error updating book. Please try again.');
    }
}

// Upload cover image
async function uploadCoverImage(input, isEdit = false) {
    const file = input.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    const previewId = isEdit ? 'edit-book-cover-preview' : 'book-cover-preview';
    const preview = document.getElementById(previewId);
    
    try {
        if (STATIC_MODE) {
            alert('정적 모드에서는 이미지를 업로드할 수 없습니다.');
            return;
        }
        
        const response = await fetch(getApiUrl('api/upload-cover'), {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            preview.src = data.url;
            preview.style.display = 'block';
            preview.setAttribute('data-cover-url', data.url);
        } else {
            alert('Error uploading image. Please try again.');
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        alert('Error uploading image. Please try again.');
    }
}

// Tab switching
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab content
    if (tabName === 'all-books') {
        document.getElementById('tab-content-all-books').classList.add('active');
        document.getElementById('tab-all-books').classList.add('active');
    } else if (tabName === 'year-end') {
        document.getElementById('tab-content-year-end').classList.add('active');
        document.getElementById('tab-year-end').classList.add('active');
        loadYearEndSummary();
    }
}

// Store books data globally for searchable dropdowns
let allYearBooks = [];

// Initialize year-end summary
async function initializeYearEndSummary() {
    // Load current year books and populate dropdowns
    try {
        if (STATIC_MODE) {
            // 정적 모드: JSON 파일에서 로드하고 클라이언트에서 필터링
            const allBooks = await loadStaticBooks();
            allYearBooks = filterCurrentYearBooks(allBooks);
        } else {
            const response = await fetch(getApiUrl('api/books/current-year'));
            allYearBooks = await response.json();
        }
        
        if (!STATIC_MODE) {
            const inputIds = [
                'enjoyable-1', 'enjoyable-2', 'enjoyable-3',
                'difficult-1', 'difficult-2', 'difficult-3',
                'best-sripeak', 'best-bookclub', 'best-milli'
            ];
            
            inputIds.forEach(inputId => {
                initializeSearchableDropdown(inputId, allYearBooks);
            });
        }
    } catch (error) {
        console.error('Error loading current year books:', error);
    }
}

// Initialize a searchable dropdown
function initializeSearchableDropdown(inputId, books) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(`${inputId}-list`);
    
    if (!input || !dropdown) return;
    
    // Store selected book index in data attribute
    input.setAttribute('data-selected-index', '');
    
    // Input focus event - show dropdown
    input.addEventListener('focus', function() {
        filterAndShowDropdown(inputId, books, '');
    });
    
    // Input change event - filter dropdown
    input.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        
        // If input is cleared, clear selection
        if (this.value.trim() === '') {
            this.setAttribute('data-selected-index', '');
            handleBookSelection(inputId, '', books);
        }
        
        filterAndShowDropdown(inputId, books, searchTerm);
    });
    
    // Click outside to close dropdown
    document.addEventListener('click', function(event) {
        const dropdownContainer = document.getElementById(`${inputId}-dropdown`);
        if (dropdownContainer && !dropdownContainer.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
}

// Filter and show dropdown items
function filterAndShowDropdown(inputId, books, searchTerm) {
    const dropdown = document.getElementById(`${inputId}-list`);
    if (!dropdown) return;
    
    // Filter books based on search term
    const filteredBooks = books.filter(book => {
        if (!searchTerm) return true;
        const title = (book.title || '').toLowerCase();
        const author = (book.author || '').toLowerCase();
        return title.includes(searchTerm) || author.includes(searchTerm);
    });
    
    // Clear dropdown
    dropdown.innerHTML = '';
    
    // Add filtered books to dropdown
    if (filteredBooks.length === 0) {
        dropdown.innerHTML = '<div class="dropdown-item">검색 결과가 없습니다</div>';
    } else {
        filteredBooks.forEach(book => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerHTML = `
                <div class="dropdown-item-title">${escapeHtml(book.title || 'Untitled')}</div>
                <div class="dropdown-item-author">${escapeHtml(book.author || 'Unknown')}</div>
            `;
            
            item.addEventListener('click', function() {
                selectBookFromDropdown(inputId, book, books);
            });
            
            dropdown.appendChild(item);
        });
    }
    
    dropdown.classList.add('show');
}

// Select book from dropdown
function selectBookFromDropdown(inputId, book, books) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(`${inputId}-list`);
    
    if (!input || !dropdown) return;
    
    // Set input value to book title
    input.value = book.title || '';
    
    // Store selected book index
    const bookIndex = book._index !== undefined ? book._index : '';
    input.setAttribute('data-selected-index', bookIndex);
    
    // Hide dropdown
    dropdown.classList.remove('show');
    
    // Handle book selection
    handleBookSelection(inputId, bookIndex, books);
}

// Handle book selection
function handleBookSelection(inputId, bookIndex, books, reason = '') {
    const book = books.find(b => (b._index !== undefined ? b._index : '') == bookIndex);
    if (!book) {
        // Clear card if no book selected
        let cardId = '';
        if (inputId.startsWith('enjoyable-')) {
            const num = inputId.split('-')[1];
            cardId = `enjoyable-card-${num}`;
        } else if (inputId.startsWith('difficult-')) {
            const num = inputId.split('-')[1];
            cardId = `difficult-card-${num}`;
        } else if (inputId === 'best-sripeak') {
            cardId = 'best-sripeak-card';
        } else if (inputId === 'best-bookclub') {
            cardId = 'best-bookclub-card';
        } else if (inputId === 'best-milli') {
            cardId = 'best-milli-card';
        }
        
        if (cardId) {
            const card = document.getElementById(cardId);
            if (card) {
                card.innerHTML = '';
            }
        }
        return;
    }
    
    // Find corresponding card element
    let cardId = '';
    if (inputId.startsWith('enjoyable-')) {
        const num = inputId.split('-')[1];
        cardId = `enjoyable-card-${num}`;
    } else if (inputId.startsWith('difficult-')) {
        const num = inputId.split('-')[1];
        cardId = `difficult-card-${num}`;
    } else if (inputId === 'best-sripeak') {
        cardId = 'best-sripeak-card';
    } else if (inputId === 'best-bookclub') {
        cardId = 'best-bookclub-card';
    } else if (inputId === 'best-milli') {
        cardId = 'best-milli-card';
    }
    
    if (cardId) {
        const card = document.getElementById(cardId);
        if (card) {
            // Find reason input ID
            let reasonInputId = '';
            if (inputId.startsWith('enjoyable-')) {
                const num = inputId.split('-')[1];
                reasonInputId = `enjoyable-reason-${num}`;
            } else if (inputId.startsWith('difficult-')) {
                const num = inputId.split('-')[1];
                reasonInputId = `difficult-reason-${num}`;
            } else if (inputId === 'best-sripeak') {
                reasonInputId = 'best-sripeak-reason';
            } else if (inputId === 'best-bookclub') {
                reasonInputId = 'best-bookclub-reason';
            } else if (inputId === 'best-milli') {
                reasonInputId = 'best-milli-reason';
            }
            
            // Get reason from input if not provided
            if (!reason && reasonInputId) {
                const reasonInput = document.getElementById(reasonInputId);
                if (reasonInput) {
                    reason = reasonInput.value || '';
                }
            }
            
            displaySelectedBook(card, book, reason);
            
            if (!STATIC_MODE && reasonInputId) {
                const reasonInput = document.getElementById(reasonInputId);
                if (reasonInput) {
                    const newReasonInput = reasonInput.cloneNode(true);
                    reasonInput.parentNode.replaceChild(newReasonInput, reasonInput);
                    
                    newReasonInput.addEventListener('input', function() {
                        displaySelectedBook(card, book, this.value);
                    });
                }
            }
        }
    }
}

// Display selected book in card
function displaySelectedBook(cardElement, book, reason = '') {
    if (!book) {
        cardElement.innerHTML = '';
        return;
    }
    
    const showReason = !STATIC_MODE && reason && reason.trim() !== '';
    
    cardElement.innerHTML = `
        <div class="selected-book-mini-card">
            <div class="mini-cover-container">
                <img class="mini-cover" alt="${escapeHtml(book.title || 'Book cover')}" 
                     data-title="${escapeHtml(book.title || '')}" 
                     data-author="${escapeHtml(book.author || '')}"
                     data-cover-image="${escapeHtml(book.cover_image || '')}">
            </div>
            <div class="mini-book-info">
                <div class="mini-title">${escapeHtml(book.title || 'Untitled')}</div>
                <div class="mini-author" id="mini-author-${Date.now()}">${escapeHtml(book.author || '') || '저자 정보 로딩 중...'}</div>
                ${showReason ? `<div class="mini-reason">💭 ${escapeHtml(reason)}</div>` : ''}
            </div>
        </div>
    `;
    
    // Load cover image
    const img = cardElement.querySelector('.mini-cover');
    if (img) {
        loadMiniCover(img, book);
    }
    
    // Load author if missing
    const authorElement = cardElement.querySelector('.mini-author');
    if (authorElement && (!book.author || book.author.trim() === '')) {
        loadAuthorForMiniCard(book.title, authorElement);
    }
}

// Load author for mini card
async function loadAuthorForMiniCard(title, authorElement) {
    if (!title || !authorElement) return;
    
    try {
        const params = new URLSearchParams({ title: title });
        const response = await fetch(`${getApiUrl('api/book-info')}?${params.toString()}`);
        const data = await response.json();
        
        if (data.author && data.author.trim() !== '') {
            authorElement.textContent = data.author;
        } else {
            authorElement.textContent = '저자 정보 없음';
        }
    } catch (error) {
        console.error('Error loading author for mini card:', error);
        authorElement.textContent = '저자 정보 없음';
    }
}

// Load mini cover image
async function loadMiniCover(img, book) {
    const coverImage = book.cover_image;
    const title = book.title;
    const author = book.author;
    
    if (coverImage && coverImage.trim() !== '') {
        const resolved = resolveCoverImageUrl(coverImage);
        if (resolved) {
            img.src = resolved;
        } else {
            loadCoverFromAPIForMini(img, title, author);
            return;
        }
        img.style.display = 'block';
        img.onerror = function() {
            loadCoverFromAPIForMini(img, title, author);
        };
        return;
    }
    
    if (title) {
        loadCoverFromAPIForMini(img, title, author);
    }
}

// Load cover from API for mini card
async function loadCoverFromAPIForMini(img, title, author) {
    try {
        const params = new URLSearchParams({ title: title });
        if (author && author.trim() !== '') {
            params.append('author', author);
        }
        
        const response = await fetch(`${getApiUrl('api/cover')}?${params.toString()}`);
        const data = await response.json();
        
        if (data.cover_url && data.cover_url.trim() !== '') {
            img.src = data.cover_url;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading cover for mini card:', error);
        img.style.display = 'none';
    }
}

// Load year-end summary
async function loadYearEndSummary() {
    try {
        // Ensure books are loaded
        if (allYearBooks.length === 0) {
            if (STATIC_MODE) {
                const allBooks = await loadStaticBooks();
                allYearBooks = filterCurrentYearBooks(allBooks);
            } else {
                const booksResponse = await fetch(getApiUrl('api/books/current-year'));
                allYearBooks = await booksResponse.json();
            }
        }
        
        let summary;
        if (STATIC_MODE) {
            summary = await loadStaticSummary();
        } else {
            const response = await fetch(getApiUrl('api/year-end-summary'));
            summary = await response.json();
        }
        
        if (summary && Object.keys(summary).length > 0) {
            // Set selected books
            if (summary.enjoyable) {
                summary.enjoyable.forEach((item, idx) => {
                    const bookIndex = typeof item === 'object' ? item.index : item;
                    const reason = typeof item === 'object' ? (item.reason || '') : '';
                    const input = document.getElementById(`enjoyable-${idx + 1}`);
                    const reasonInput = document.getElementById(`enjoyable-reason-${idx + 1}`);
                    
                    if (input) {
                        const book = allYearBooks.find(b => (b._index !== undefined ? b._index : '') == bookIndex);
                        if (book) {
                            input.value = book.title || '';
                            input.setAttribute('data-selected-index', bookIndex);
                            handleBookSelection(`enjoyable-${idx + 1}`, bookIndex, allYearBooks, reason);
                        }
                    }
                    if (reasonInput && reason) {
                        reasonInput.value = reason;
                    }
                });
            }
            
            if (summary.difficult) {
                summary.difficult.forEach((item, idx) => {
                    const bookIndex = typeof item === 'object' ? item.index : item;
                    const reason = typeof item === 'object' ? (item.reason || '') : '';
                    const input = document.getElementById(`difficult-${idx + 1}`);
                    const reasonInput = document.getElementById(`difficult-reason-${idx + 1}`);
                    
                    if (input) {
                        const book = allYearBooks.find(b => (b._index !== undefined ? b._index : '') == bookIndex);
                        if (book) {
                            input.value = book.title || '';
                            input.setAttribute('data-selected-index', bookIndex);
                            handleBookSelection(`difficult-${idx + 1}`, bookIndex, allYearBooks, reason);
                        }
                    }
                    if (reasonInput && reason) {
                        reasonInput.value = reason;
                    }
                });
            }
            
            if (summary.best) {
                if (summary.best.sripeak !== undefined && summary.best.sripeak !== null) {
                    const bookIndex = typeof summary.best.sripeak === 'object' ? summary.best.sripeak.index : summary.best.sripeak;
                    const reason = typeof summary.best.sripeak === 'object' ? (summary.best.sripeak.reason || '') : '';
                    const input = document.getElementById('best-sripeak');
                    const reasonInput = document.getElementById('best-sripeak-reason');
                    
                    if (input) {
                        const book = allYearBooks.find(b => (b._index !== undefined ? b._index : '') == bookIndex);
                        if (book) {
                            input.value = book.title || '';
                            input.setAttribute('data-selected-index', bookIndex);
                            handleBookSelection('best-sripeak', bookIndex, allYearBooks, reason);
                        }
                    }
                    if (reasonInput && reason) {
                        reasonInput.value = reason;
                    }
                }
                if (summary.best.bookclub !== undefined && summary.best.bookclub !== null) {
                    const bookIndex = typeof summary.best.bookclub === 'object' ? summary.best.bookclub.index : summary.best.bookclub;
                    const reason = typeof summary.best.bookclub === 'object' ? (summary.best.bookclub.reason || '') : '';
                    const input = document.getElementById('best-bookclub');
                    const reasonInput = document.getElementById('best-bookclub-reason');
                    
                    if (input) {
                        const book = allYearBooks.find(b => (b._index !== undefined ? b._index : '') == bookIndex);
                        if (book) {
                            input.value = book.title || '';
                            input.setAttribute('data-selected-index', bookIndex);
                            handleBookSelection('best-bookclub', bookIndex, allYearBooks, reason);
                        }
                    }
                    if (reasonInput && reason) {
                        reasonInput.value = reason;
                    }
                }
                if (summary.best.milli !== undefined && summary.best.milli !== null) {
                    const bookIndex = typeof summary.best.milli === 'object' ? summary.best.milli.index : summary.best.milli;
                    const reason = typeof summary.best.milli === 'object' ? (summary.best.milli.reason || '') : '';
                    const input = document.getElementById('best-milli');
                    const reasonInput = document.getElementById('best-milli-reason');
                    
                    if (input) {
                        const book = allYearBooks.find(b => (b._index !== undefined ? b._index : '') == bookIndex);
                        if (book) {
                            input.value = book.title || '';
                            input.setAttribute('data-selected-index', bookIndex);
                            handleBookSelection('best-milli', bookIndex, allYearBooks, reason);
                        }
                    }
                    if (reasonInput && reason) {
                        reasonInput.value = reason;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error loading year-end summary:', error);
    }
}

// Show read-only banner
function showReadOnlyBanner() {
    const container = document.querySelector('.container');
    if (!container) return;
    
    const banner = document.createElement('div');
    banner.className = 'read-only-banner';
    banner.innerHTML = '📖 읽기 전용 모드 - GitHub Pages에서 실행 중입니다. 데이터 수정은 localhost에서만 가능합니다.';
    container.insertBefore(banner, container.firstChild);
}

// Disable write features
function disableWriteFeatures() {
    // Hide or disable Add Book button
    const addBookBtn = document.getElementById('add-book-btn');
    if (addBookBtn) {
        addBookBtn.style.display = 'none';
    }
    
    // Hide Edit buttons (will be handled in displayBooks)
    // Hide Save Summary button
    const saveSummaryBtn = document.getElementById('save-summary-btn');
    if (saveSummaryBtn) {
        saveSummaryBtn.style.display = 'none';
    }
    
    // Hide dropdown inputs for year-end summary
    document.querySelectorAll('.searchable-dropdown').forEach(dropdown => {
        dropdown.style.display = 'none';
    });
    
    // Hide reason input areas (read-only mode)
    document.querySelectorAll('.reason-input-container').forEach(container => {
        container.style.display = 'none';
    });
}

// Save year-end summary
async function saveYearEndSummary() {
    const summary = {
        enjoyable: [],
        difficult: [],
        best: {
            sripeak: null,
            bookclub: null,
            milli: null
        }
    };
    
    // Get enjoyable books with reasons
    for (let i = 1; i <= 3; i++) {
        const input = document.getElementById(`enjoyable-${i}`);
        const reasonInput = document.getElementById(`enjoyable-reason-${i}`);
        if (input) {
            const selectedIndex = input.getAttribute('data-selected-index');
            if (selectedIndex && selectedIndex !== '') {
                const reason = reasonInput ? reasonInput.value.trim() : '';
                summary.enjoyable.push({
                    index: parseInt(selectedIndex),
                    reason: reason
                });
            }
        }
    }
    
    // Get difficult books with reasons
    for (let i = 1; i <= 3; i++) {
        const input = document.getElementById(`difficult-${i}`);
        const reasonInput = document.getElementById(`difficult-reason-${i}`);
        if (input) {
            const selectedIndex = input.getAttribute('data-selected-index');
            if (selectedIndex && selectedIndex !== '') {
                const reason = reasonInput ? reasonInput.value.trim() : '';
                summary.difficult.push({
                    index: parseInt(selectedIndex),
                    reason: reason
                });
            }
        }
    }
    
    // Get best books with reasons
    const bestSripeak = document.getElementById('best-sripeak');
    const bestSripeakReason = document.getElementById('best-sripeak-reason');
    if (bestSripeak) {
        const selectedIndex = bestSripeak.getAttribute('data-selected-index');
        if (selectedIndex && selectedIndex !== '') {
            const reason = bestSripeakReason ? bestSripeakReason.value.trim() : '';
            summary.best.sripeak = {
                index: parseInt(selectedIndex),
                reason: reason
            };
        }
    }
    
    const bestBookclub = document.getElementById('best-bookclub');
    const bestBookclubReason = document.getElementById('best-bookclub-reason');
    if (bestBookclub) {
        const selectedIndex = bestBookclub.getAttribute('data-selected-index');
        if (selectedIndex && selectedIndex !== '') {
            const reason = bestBookclubReason ? bestBookclubReason.value.trim() : '';
            summary.best.bookclub = {
                index: parseInt(selectedIndex),
                reason: reason
            };
        }
    }
    
    const bestMilli = document.getElementById('best-milli');
    const bestMilliReason = document.getElementById('best-milli-reason');
    if (bestMilli) {
        const selectedIndex = bestMilli.getAttribute('data-selected-index');
        if (selectedIndex && selectedIndex !== '') {
            const reason = bestMilliReason ? bestMilliReason.value.trim() : '';
            summary.best.milli = {
                index: parseInt(selectedIndex),
                reason: reason
            };
        }
    }
    
    try {
        if (STATIC_MODE) {
            alert('정적 모드에서는 연말 결산을 저장할 수 없습니다.');
            return;
        }
        
        const response = await fetch(getApiUrl('api/year-end-summary'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(summary)
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('연말 결산이 저장되었습니다!');
        } else {
            alert('저장 중 오류가 발생했습니다. 다시 시도해주세요.');
        }
    } catch (error) {
        console.error('Error saving year-end summary:', error);
        alert('저장 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
}
