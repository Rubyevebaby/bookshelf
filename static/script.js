// Load books and stats on page load
let currentFeedEntries = [];
let feedEditingId = null;
let feedEditingImageUrl = '';
let feedTags = [];
let recommendationEntries = [];
let recommendationEditingId = null;
let recommendationProfileImageUrl = '';
let aboutProfileImageUrl = '';
let aboutData = null;
let aboutEditMode = false;

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
    const feedImageInput = document.getElementById('feed-image-input');
    if (feedImageInput) {
        feedImageInput.addEventListener('change', handleFeedImageUpload);
    }
    const feedSubmitBtn = document.getElementById('feed-submit-btn');
    if (feedSubmitBtn) {
        feedSubmitBtn.addEventListener('click', submitFeedEntry);
    }
    const feedExportBtn = document.getElementById('feed-export-btn');
    if (feedExportBtn) {
        feedExportBtn.addEventListener('click', exportFeedData);
    }
    const feedCancelEditBtn = document.getElementById('feed-cancel-edit-btn');
    if (feedCancelEditBtn) {
        feedCancelEditBtn.addEventListener('click', cancelFeedEdit);
    }
    const tagInput = document.getElementById('feed-tag-input');
    if (tagInput) {
        tagInput.addEventListener('keydown', handleFeedTagKeyDown);
    }
    renderFeedTags();
    const recommendationProfileUpload = document.getElementById('recommendation-profile-upload');
    if (recommendationProfileUpload) {
        recommendationProfileUpload.addEventListener('change', handleRecommendationProfileUpload);
    }
    document.querySelectorAll('.recommendation-book-upload').forEach((input, index) => {
        input.addEventListener('change', event => handleRecommendationBookUpload(event, index));
    });
    const recommendationSubmitBtn = document.getElementById('recommendation-submit-btn');
    if (recommendationSubmitBtn) {
        recommendationSubmitBtn.addEventListener('click', submitRecommendationEntry);
    }
    const recommendationCancelBtn = document.getElementById('recommendation-cancel-edit-btn');
    if (recommendationCancelBtn) {
        recommendationCancelBtn.addEventListener('click', cancelRecommendationEdit);
    }
    const recommendationExportBtn = document.getElementById('recommendation-export-btn');
    if (recommendationExportBtn) {
        recommendationExportBtn.addEventListener('click', exportRecommendationsData);
    }
    const aboutProfileUpload = document.getElementById('about-profile-upload');
    if (aboutProfileUpload) {
        aboutProfileUpload.addEventListener('change', handleAboutProfileUpload);
    }
    const aboutSaveBtn = document.getElementById('about-save-btn');
    if (aboutSaveBtn) {
        aboutSaveBtn.addEventListener('click', saveAboutSection);
    }
    const aboutCancelBtn = document.getElementById('about-cancel-btn');
    if (aboutCancelBtn) {
        aboutCancelBtn.addEventListener('click', resetAboutEditor);
    }
    const aboutEditBtn = document.getElementById('about-edit-btn');
    if (aboutEditBtn) {
        aboutEditBtn.addEventListener('click', () => toggleAboutEditor(true));
    }
    
    // Initialize year-end summary
    initializeYearEndSummary();
    initializeReadingFeed();
    initializeRecommendations();
    initializeAboutSection();
    
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
        let data;
        if (STATIC_MODE) {
            data = await loadStaticStats();
        } else {
            const response = await fetch(getApiUrl('api/stats'));
            data = await response.json();
            if (document.getElementById('year-count')) {
                document.getElementById('year-count').textContent = data.current_year_count;
            }
        }
        if (data) {
            const dateEl = document.getElementById('current-date');
            if (dateEl) {
                const todayText = STATIC_MODE ? formatClientToday() : data.current_date;
                dateEl.textContent = todayText;
            }
            const monthlyEl = document.getElementById('monthly-average');
            if (monthlyEl) monthlyEl.textContent = formatStatValue(data.monthly_average, 2);
            const pagesEl = document.getElementById('total-pages');
            if (pagesEl) pagesEl.textContent = formatStatValue(data.total_pages, 0);
            const charsEl = document.getElementById('total-characters');
            if (charsEl) charsEl.textContent = formatStatValue(data.total_characters, 0);
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
    } else if (tabName === 'recommendations') {
        document.getElementById('tab-content-recommendations').classList.add('active');
        document.getElementById('tab-recommendations').classList.add('active');
        loadRecommendations();
    } else if (tabName === 'reading-feed') {
        document.getElementById('tab-content-reading-feed').classList.add('active');
        document.getElementById('tab-reading-feed').classList.add('active');
        loadReadingFeed();
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
    
    const reasonHtml = reason ? `<div class="selected-book-reason">💭 ${escapeHtml(reason)}</div>` : '';
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
            </div>
        </div>
        ${reasonHtml}
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
    
    const feedComposeSection = document.getElementById('feed-compose-section');
    if (feedComposeSection) {
        feedComposeSection.style.display = 'none';
    }
    const feedExportNote = document.getElementById('feed-export-note');
    if (feedExportNote) {
        feedExportNote.style.display = 'none';
    }
    const recommendationCompose = document.getElementById('recommendation-compose-section');
    if (recommendationCompose) {
        recommendationCompose.style.display = 'none';
    }
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

// Reading feed logic
async function initializeReadingFeed() {
    if (STATIC_MODE) {
        const compose = document.getElementById('feed-compose-section');
        if (compose) {
            compose.style.display = 'none';
        }
    }
    await loadReadingFeed();
}

async function loadReadingFeed() {
    try {
        let feedEntries = [];
        if (STATIC_MODE) {
            feedEntries = await loadStaticFeedEntries();
        } else {
            const response = await fetch(getApiUrl('api/feed'));
            feedEntries = await response.json();
        }
        const sortedEntries = Array.isArray(feedEntries) ? [...feedEntries] : [];
        sortedEntries.sort((a, b) => {
            const dateA = new Date(a?.created_at || '');
            const dateB = new Date(b?.created_at || '');
            return dateB - dateA;
        });
        currentFeedEntries = sortedEntries;
        renderReadingFeed(sortedEntries);
    } catch (error) {
        console.error('Error loading reading feed:', error);
    }
}

function renderReadingFeed(entries) {
    const grid = document.getElementById('reading-feed-grid');
    if (!grid) return;
    
    if (!entries || entries.length === 0) {
        grid.innerHTML = '<div class="feed-empty">아직 게시된 피드가 없습니다. 첫 감상을 공유해보세요!</div>';
        return;
    }
    
    grid.innerHTML = entries.map(entry => {
        const resolvedImage = entry.image_url ? resolveCoverImageUrl(entry.image_url) || entry.image_url : '';
        const actions = STATIC_MODE ? '' : `
            <div class="feed-card-actions">
                <button class="feed-card-btn" onclick="editFeedEntry('${entry.id}')">수정</button>
                <button class="feed-card-btn danger" onclick="deleteFeedEntry('${entry.id}')">삭제</button>
            </div>
        `;
        return `
        <div class="feed-card">
            ${resolvedImage ? `<img class="feed-card-image" src="${resolvedImage}" alt="피드 이미지">` : ''}
            <div class="feed-card-body">
                <div class="feed-card-caption">${formatFeedCaption(entry.caption || '')}</div>
                ${renderMoodTags(getEntryMoodTags(entry))}
                <div class="feed-card-meta">
                    <span>${formatFeedTimestamp(entry.created_at)}</span>
                    ${entry.image_url ? '<span>📷</span>' : ''}
                </div>
                ${actions}
            </div>
        </div>
    `;
    }).join('');
}

// Recommendations logic
async function initializeRecommendations() {
    if (STATIC_MODE) {
        const compose = document.getElementById('recommendation-compose-section');
        if (compose) {
            compose.style.display = 'none';
        }
    }
    await loadRecommendations();
}

async function loadRecommendations() {
    try {
        let entries = [];
        if (STATIC_MODE) {
            entries = await loadStaticRecommendations();
        } else {
            const response = await fetch(getApiUrl('api/recommendations'));
            entries = await response.json();
        }
        recommendationEntries = Array.isArray(entries) ? entries : [];
        renderRecommendations(recommendationEntries);
    } catch (error) {
        console.error('Error loading recommendations:', error);
    }
}

function renderRecommendations(entries) {
    const list = document.getElementById('recommendations-list');
    if (!list) return;
    
    if (!entries || entries.length === 0) {
        list.innerHTML = '<div class="feed-empty">아직 등록된 추천이 없습니다.</div>';
        return;
    }
    
    list.innerHTML = entries.map(entry => {
        const profileImage = entry.profile_image ? (resolveCoverImageUrl(entry.profile_image) || entry.profile_image) : '';
        const fallbackTitle = entry.recommender_name ? `${entry.recommender_name}의 책 추천` : '추천 도서';
        const titleText = entry.title && entry.title.trim() !== '' ? entry.title : fallbackTitle;
        const safeTitle = escapeHtml(titleText);
        const actions = STATIC_MODE ? '' : `
            <div class="recommendation-card-actions">
                <button class="feed-card-btn" onclick="moveRecommendationEntry('${entry.id}', 'up')">▲</button>
                <button class="feed-card-btn" onclick="moveRecommendationEntry('${entry.id}', 'down')">▼</button>
                <button class="feed-card-btn" onclick="editRecommendationEntry('${entry.id}')">수정</button>
                <button class="feed-card-btn danger" onclick="deleteRecommendationEntry('${entry.id}')">삭제</button>
            </div>
        `;
        return `
            <div class="recommendation-card">
                <div class="recommendation-header">
                    ${profileImage ? `<img src="${profileImage}" alt="추천인">` : `<div class="profile-preview-wrapper" style="width:70px;height:70px;"><span class="profile-placeholder">No Image</span></div>`}
                    <div>
                        <div class="recommendation-title">${safeTitle}</div>
                        <div class="recommendation-subtitle">${escapeHtml(entry.recommender_name || '')}</div>
                    </div>
                </div>
                ${entry.reason ? `<div class="recommendation-reason">${formatMultilineText(entry.reason)}</div>` : ''}
                ${renderRecommendationBooks(entry.books)}
                ${actions}
            </div>
        `;
    }).join('');
}

function renderRecommendationBooks(books) {
    if (!books || !books.length) {
        return '';
    }
    const cards = books.slice(0, 3).map(book => {
        const cover = book.cover_image ? (resolveCoverImageUrl(book.cover_image) || book.cover_image) : '';
        return `
            <div class="recommendation-book-card">
                ${cover ? `<img class="recommendation-book-cover" src="${cover}" alt="${escapeHtml(book.title || '')}">` : '<div class="recommendation-book-cover"></div>'}
                <div class="recommendation-book-info">
                    <div class="recommendation-book-title">${escapeHtml(book.title || 'Untitled')}</div>
                    <div class="recommendation-book-author">${escapeHtml(book.author || '')}</div>
                    ${book.description ? `<div class="recommendation-book-description">${escapeHtml(book.description)}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
    return `<div class="recommendation-books-row">${cards}</div>`;
}

async function initializeAboutSection() {
    const editor = document.getElementById('about-editor-section');
    const editBtn = document.getElementById('about-edit-btn');
    if (STATIC_MODE) {
        if (editor) editor.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
    } else {
        toggleAboutEditor(false);
    }
    await loadAboutData();
}

async function loadAboutData() {
    try {
        if (STATIC_MODE) {
            aboutData = await loadStaticAbout();
        } else {
            const response = await fetch(getApiUrl('api/about'));
            aboutData = await response.json();
        }
    } catch (error) {
        console.error('Error loading about data:', error);
        aboutData = null;
    }
    if (!aboutData) {
        aboutData = {
            profile_image: '',
            title: '안녕하세요, 스리입니다 👋',
            description: '책을 읽고 기록하며 느낀 점들을 이곳에 차곡차곡 쌓고 있어요.',
            highlights: []
        };
    }
    aboutProfileImageUrl = aboutData.profile_image || '';
    renderAboutDisplay();
    fillAboutEditor();
}

function renderAboutDisplay() {
    const data = aboutData || {};
    const titleEl = document.getElementById('about-title');
    const descEl = document.getElementById('about-description');
    const profileEl = document.getElementById('about-profile-image');
    const listEl = document.getElementById('about-highlights');
    if (titleEl) titleEl.textContent = data.title || '안녕하세요, 스리입니다 👋';
    if (descEl) descEl.textContent = data.description || '책을 읽고 기록하며 느낀 점들을 이곳에 차곡차곡 쌓고 있어요.';
    if (profileEl) {
        if (data.profile_image) {
            profileEl.src = resolveCoverImageUrl(data.profile_image) || data.profile_image;
        } else {
            profileEl.src = 'https://placehold.co/200x200?text=Sri';
        }
    }
    if (listEl) {
        const highlights = Array.isArray(data.highlights) && data.highlights.length > 0 ? data.highlights : [];
        listEl.innerHTML = highlights.map(item => `<li>${escapeHtml(item)}</li>`).join('');
    }
}

function fillAboutEditor() {
    const data = aboutData || {};
    const titleInput = document.getElementById('about-title-input');
    const descInput = document.getElementById('about-description-input');
    const highlightInputs = document.querySelectorAll('.about-highlight-input');
    if (titleInput) titleInput.value = data.title || '';
    if (descInput) descInput.value = data.description || '';
    const highlights = Array.isArray(data.highlights) ? data.highlights : [];
    highlightInputs.forEach((input, index) => {
        input.value = highlights[index] || '';
    });
    const preview = document.getElementById('about-profile-preview');
    const placeholder = document.querySelector('#about-editor-section .profile-placeholder');
    if (preview) {
        if (data.profile_image) {
            preview.src = resolveCoverImageUrl(data.profile_image) || data.profile_image;
            preview.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
        } else {
            preview.src = '';
            preview.style.display = 'none';
            if (placeholder) placeholder.style.display = 'block';
        }
    }
}

function toggleAboutEditor(show) {
    if (STATIC_MODE) return;
    aboutEditMode = show;
    const editor = document.getElementById('about-editor-section');
    const editBtn = document.getElementById('about-edit-btn');
    if (editor) {
        editor.style.display = show ? 'block' : 'none';
    }
    if (editBtn) {
        editBtn.style.display = show ? 'none' : 'inline-flex';
    }
}

async function handleAboutProfileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (STATIC_MODE) {
        alert('정적 모드에서는 이미지를 업로드할 수 없습니다.');
        return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch(getApiUrl('api/upload-cover'), {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            aboutProfileImageUrl = data.url;
            const preview = document.getElementById('about-profile-preview');
            const placeholder = document.querySelector('#about-editor-section .profile-placeholder');
            if (preview) {
                preview.src = data.url;
                preview.style.display = 'block';
            }
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        } else {
            alert('이미지 업로드 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error uploading about profile image:', error);
        alert('이미지 업로드 중 오류가 발생했습니다.');
    }
}

function collectAboutHighlights() {
    const inputs = document.querySelectorAll('.about-highlight-input');
    const highlights = [];
    inputs.forEach(input => {
        const value = input.value.trim();
        if (value) highlights.push(value);
    });
    return highlights;
}

async function saveAboutSection(event) {
    event.preventDefault();
    if (STATIC_MODE) {
        alert('정적 모드에서는 소개를 수정할 수 없습니다.');
        return;
    }
    const titleInput = document.getElementById('about-title-input');
    const descInput = document.getElementById('about-description-input');
    const payload = {
        title: titleInput ? titleInput.value.trim() : '',
        description: descInput ? descInput.value.trim() : '',
        profile_image: aboutProfileImageUrl,
        highlights: collectAboutHighlights()
    };
    try {
        const response = await fetch(getApiUrl('api/about'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success) {
            aboutData = data.about;
            renderAboutDisplay();
            fillAboutEditor();
            toggleAboutEditor(false);
        } else {
            alert(data.error || '소개 저장 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error saving about data:', error);
        alert('소개 저장 중 오류가 발생했습니다.');
    }
}

function resetAboutEditor(event) {
    if (event) event.preventDefault();
    aboutProfileImageUrl = aboutData && aboutData.profile_image ? aboutData.profile_image : '';
    fillAboutEditor();
    toggleAboutEditor(false);
}

function collectRecommendationBooks() {
    const blocks = document.querySelectorAll('.recommendation-book-block');
    const books = [];
    blocks.forEach(block => {
        const title = block.querySelector('.recommendation-book-title')?.value.trim() || '';
        const author = block.querySelector('.recommendation-book-author')?.value.trim() || '';
        const description = block.querySelector('.recommendation-book-description')?.value.trim() || '';
        const cover = block.querySelector('.recommendation-book-cover')?.value.trim() || '';
        if (title || author || description || cover) {
            books.push({ title, author, description, cover_image: cover });
        }
    });
    return books.slice(0, 3);
}

function fillRecommendationBooks(entry) {
    const blocks = document.querySelectorAll('.recommendation-book-block');
    blocks.forEach((block, idx) => {
        const book = entry.books && entry.books[idx] ? entry.books[idx] : {};
        block.querySelector('.recommendation-book-title').value = book.title || '';
        block.querySelector('.recommendation-book-author').value = book.author || '';
        block.querySelector('.recommendation-book-description').value = book.description || '';
        block.querySelector('.recommendation-book-cover').value = book.cover_image || '';
        updateRecommendationBookPreview(idx, book.cover_image || '');
        const uploadInput = block.querySelector('.recommendation-book-upload');
        if (uploadInput) {
            uploadInput.value = '';
        }
    });
}

async function submitRecommendationEntry(event) {
    event.preventDefault();
    
    if (STATIC_MODE) {
        alert('정적 모드에서는 추천을 수정할 수 없습니다.');
        return;
    }
    
    const nameInput = document.getElementById('recommendation-name');
    const titleInput = document.getElementById('recommendation-title');
    const reasonInput = document.getElementById('recommendation-reason');
    const submitBtn = document.getElementById('recommendation-submit-btn');
    
    const recommenderName = nameInput ? nameInput.value.trim() : '';
    if (!recommenderName) {
        alert('추천인 이름을 입력해주세요.');
        return;
    }
    
    const payload = {
        recommender_name: recommenderName,
        title: titleInput ? titleInput.value.trim() : '',
        reason: reasonInput ? reasonInput.value.trim() : '',
        profile_image: recommendationProfileImageUrl,
        books: collectRecommendationBooks()
    };
    
    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = recommendationEditingId ? '수정 중...' : '추천 저장 중...';
        }
        
        const method = recommendationEditingId ? 'PUT' : 'POST';
        const url = recommendationEditingId ? `${getApiUrl('api/recommendations')}/${recommendationEditingId}` : getApiUrl('api/recommendations');
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.success) {
            recommendationEditingId = null;
            recommendationProfileImageUrl = '';
            resetRecommendationForm();
            await loadRecommendations();
        } else {
            alert(data.error || '추천 저장 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error saving recommendation:', error);
        alert('추천 저장 중 오류가 발생했습니다.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '추천 저장';
        }
    }
}

function editRecommendationEntry(entryId) {
    if (STATIC_MODE) return;
    const entry = recommendationEntries.find(item => item.id === entryId);
    if (!entry) return;
    
    recommendationEditingId = entryId;
    recommendationProfileImageUrl = entry.profile_image || '';
    
    const nameInput = document.getElementById('recommendation-name');
    const titleInput = document.getElementById('recommendation-title');
    const reasonInput = document.getElementById('recommendation-reason');
    const preview = document.getElementById('recommendation-profile-preview');
    const placeholder = document.querySelector('#recommendation-compose-section .profile-placeholder');
    const cancelBtn = document.getElementById('recommendation-cancel-edit-btn');
    
    if (nameInput) nameInput.value = entry.recommender_name || '';
    if (titleInput) titleInput.value = entry.title || '';
    if (reasonInput) reasonInput.value = entry.reason || '';
    if (preview) {
        if (entry.profile_image) {
            const resolved = resolveCoverImageUrl(entry.profile_image) || entry.profile_image;
            preview.src = resolved;
            preview.style.display = 'block';
            preview.setAttribute('data-image-url', entry.profile_image);
        } else {
            preview.src = '';
            preview.style.display = 'none';
            preview.setAttribute('data-image-url', '');
        }
    }
    if (placeholder) {
        placeholder.style.display = entry.profile_image ? 'none' : 'block';
    }
    fillRecommendationBooks(entry);
    if (cancelBtn) {
        cancelBtn.style.display = 'inline-flex';
    }
}

async function deleteRecommendationEntry(entryId) {
    if (STATIC_MODE) return;
    if (!confirm('이 추천을 삭제하시겠습니까?')) {
        return;
    }
    try {
        const response = await fetch(`${getApiUrl('api/recommendations')}/${entryId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            if (recommendationEditingId === entryId) {
                cancelRecommendationEdit();
            }
            await loadRecommendations();
        } else {
            alert(data.error || '삭제 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error deleting recommendation:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
}

async function moveRecommendationEntry(entryId, direction) {
    if (STATIC_MODE) return;
    try {
        const response = await fetch(`${getApiUrl('api/recommendations')}/${entryId}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction })
        });
        const data = await response.json();
        if (data.success) {
            await loadRecommendations();
        } else {
            alert(data.error || '순서 변경 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error moving recommendation:', error);
        alert('순서 변경 중 오류가 발생했습니다.');
    }
}

function cancelRecommendationEdit(event) {
    if (event) event.preventDefault();
    recommendationEditingId = null;
    recommendationProfileImageUrl = '';
    resetRecommendationForm();
}

function resetRecommendationForm() {
    const nameInput = document.getElementById('recommendation-name');
    const titleInput = document.getElementById('recommendation-title');
    const reasonInput = document.getElementById('recommendation-reason');
    const preview = document.getElementById('recommendation-profile-preview');
    const placeholder = document.querySelector('#recommendation-compose-section .profile-placeholder');
    const cancelBtn = document.getElementById('recommendation-cancel-edit-btn');
    const profileUpload = document.getElementById('recommendation-profile-upload');
    if (nameInput) nameInput.value = '';
    if (titleInput) titleInput.value = '';
    if (reasonInput) reasonInput.value = '';
    if (profileUpload) profileUpload.value = '';
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
        preview.setAttribute('data-image-url', '');
    }
    if (placeholder) {
        placeholder.style.display = 'block';
    }
    document.querySelectorAll('.recommendation-book-block').forEach(block => {
        block.querySelector('.recommendation-book-title').value = '';
        block.querySelector('.recommendation-book-author').value = '';
        block.querySelector('.recommendation-book-description').value = '';
        block.querySelector('.recommendation-book-cover').value = '';
        const upload = block.querySelector('.recommendation-book-upload');
        if (upload) upload.value = '';
    });
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }
    recommendationProfileImageUrl = '';
}

async function handleRecommendationProfileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (STATIC_MODE) {
        alert('정적 모드에서는 이미지를 업로드할 수 없습니다.');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(getApiUrl('api/upload-cover'), {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            recommendationProfileImageUrl = data.url;
            const preview = document.getElementById('recommendation-profile-preview');
            const placeholder = document.querySelector('#recommendation-compose-section .profile-placeholder');
            if (preview) {
                preview.src = data.url;
                preview.style.display = 'block';
                preview.setAttribute('data-image-url', data.url);
            }
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        } else {
            alert('이미지 업로드 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error uploading profile image:', error);
        alert('이미지 업로드 중 오류가 발생했습니다.');
    }
}

async function handleRecommendationBookUpload(event, index) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (STATIC_MODE) {
        alert('정적 모드에서는 이미지를 업로드할 수 없습니다.');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(getApiUrl('api/upload-cover'), {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            const coverInputs = document.querySelectorAll('.recommendation-book-cover');
            if (coverInputs[index]) {
                coverInputs[index].value = data.url;
            }
            updateRecommendationBookPreview(index, data.url);
        } else {
            alert('이미지 업로드 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error uploading recommendation book image:', error);
        alert('이미지 업로드 중 오류가 발생했습니다.');
    }
}

function updateRecommendationBookPreview(index, url) {
    const previews = document.querySelectorAll('.recommendation-book-preview');
    const placeholders = document.querySelectorAll('.recommendation-book-placeholder');
    if (!previews[index]) return;
    if (url && url.trim() !== '') {
        const resolved = resolveCoverImageUrl(url) || url.trim();
        previews[index].src = resolved;
        previews[index].style.display = 'block';
        previews[index].setAttribute('data-image-url', url.trim());
        if (placeholders[index]) {
            placeholders[index].style.display = 'none';
        }
    } else {
        previews[index].src = '';
        previews[index].style.display = 'none';
        previews[index].setAttribute('data-image-url', '');
        if (placeholders[index]) {
            placeholders[index].style.display = 'block';
        }
    }
}

async function exportRecommendationsData(event) {
    event.preventDefault();
    
    if (STATIC_MODE) {
        alert('정적 모드에서는 Export를 실행할 수 없습니다.');
        return;
    }
    
    if (!confirm('추천 데이터를 포함하여 정적 파일을 export하시겠습니까?')) {
        return;
    }
    
    const button = document.getElementById('recommendation-export-btn');
    if (button) {
        button.disabled = true;
        button.textContent = 'Exporting...';
    }
    
    try {
        const response = await fetch(getApiUrl('api/export-static'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (data.success) {
            alert('Export가 완료되었습니다! 변경 사항을 커밋/푸시해 주세요.');
        } else {
            alert('Export 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error exporting recommendations:', error);
        alert('Export 중 오류가 발생했습니다.');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '📤 Export Recommendations';
        }
    }
}

async function deleteFeedEntry(entryId) {
    if (STATIC_MODE) return;
    if (!confirm('이 피드를 삭제할까요? 되돌릴 수 없습니다.')) {
        return;
    }
    try {
        const response = await fetch(`${getApiUrl('api/feed')}/${entryId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            if (feedEditingId === entryId) {
                cancelFeedEdit();
            }
            await loadReadingFeed();
        } else {
            alert(data.error || '삭제 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error deleting feed entry:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
}

function editFeedEntry(entryId) {
    if (STATIC_MODE) return;
    const entry = currentFeedEntries.find(item => item.id === entryId);
    if (!entry) return;
    
    feedEditingId = entryId;
    feedEditingImageUrl = entry.image_url || '';
    
    const captionInput = document.getElementById('feed-caption');
    const preview = document.getElementById('feed-image-preview');
    const placeholder = document.querySelector('.feed-image-placeholder');
    const submitBtn = document.getElementById('feed-submit-btn');
    const cancelBtn = document.getElementById('feed-cancel-edit-btn');
    
    feedTags = getEntryMoodTags(entry);
    renderFeedTags();
    if (captionInput) captionInput.value = entry.caption || '';
    if (preview) {
        if (entry.image_url) {
            const resolved = resolveCoverImageUrl(entry.image_url) || entry.image_url;
            preview.src = resolved;
            preview.style.display = 'block';
            preview.setAttribute('data-image-url', entry.image_url);
        } else {
            preview.src = '';
            preview.style.display = 'none';
            preview.setAttribute('data-image-url', '');
        }
    }
    if (placeholder) {
        placeholder.style.display = entry.image_url ? 'none' : 'block';
    }
    if (submitBtn) {
        submitBtn.textContent = '수정 완료';
    }
    if (cancelBtn) {
        cancelBtn.style.display = 'inline-flex';
    }
}

function cancelFeedEdit(event) {
    if (event) event.preventDefault();
    feedEditingId = null;
    feedEditingImageUrl = '';
    resetFeedForm();
}

function resetFeedForm() {
    const captionInput = document.getElementById('feed-caption');
    const preview = document.getElementById('feed-image-preview');
    const placeholder = document.querySelector('.feed-image-placeholder');
    const submitBtn = document.getElementById('feed-submit-btn');
    const cancelBtn = document.getElementById('feed-cancel-edit-btn');
    if (captionInput) captionInput.value = '';
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
        preview.setAttribute('data-image-url', '');
    }
    if (placeholder) {
        placeholder.style.display = 'block';
    }
    if (submitBtn) {
        submitBtn.textContent = '게시하기';
    }
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }
    feedTags = [];
    renderFeedTags();
}

async function handleFeedImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (STATIC_MODE) {
        alert('정적 모드에서는 이미지를 업로드할 수 없습니다.');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(getApiUrl('api/upload-cover'), {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            const preview = document.getElementById('feed-image-preview');
            if (preview) {
                preview.src = data.url;
                preview.style.display = 'block';
                preview.setAttribute('data-image-url', data.url);
                if (feedEditingId) {
                    feedEditingImageUrl = data.url;
                }
            }
            const placeholder = document.querySelector('.feed-image-placeholder');
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        } else {
            alert('이미지 업로드 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error uploading feed image:', error);
        alert('이미지 업로드 중 오류가 발생했습니다.');
    }
}

async function submitFeedEntry(event) {
    event.preventDefault();
    
    if (STATIC_MODE) {
        alert('정적 모드에서는 피드를 작성할 수 없습니다.');
        return;
    }
    
    const captionInput = document.getElementById('feed-caption');
    const preview = document.getElementById('feed-image-preview');
    const submitBtn = document.getElementById('feed-submit-btn');
    
    const caption = captionInput ? captionInput.value.trim() : '';
    let imageUrl = preview ? (preview.getAttribute('data-image-url') || '') : '';
    if (!imageUrl && feedEditingImageUrl) {
        imageUrl = feedEditingImageUrl;
    }
    
    if (!caption && !imageUrl) {
        alert('이미지나 글 중 하나 이상은 입력해야 합니다.');
        return;
    }
    
    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = feedEditingId ? '수정 중...' : '게시 중...';
        }
        
        const method = feedEditingId ? 'PUT' : 'POST';
        const url = feedEditingId ? `${getApiUrl('api/feed')}/${feedEditingId}` : getApiUrl('api/feed');
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                caption,
                image_url: imageUrl,
                mood_tags: feedTags
            })
        });
        
        const data = await response.json();
        if (data.success) {
            feedEditingId = null;
            feedEditingImageUrl = '';
            if (captionInput) captionInput.value = '';
            if (preview) {
                preview.src = '';
                preview.style.display = 'none';
                preview.setAttribute('data-image-url', '');
            }
            const placeholder = document.querySelector('.feed-image-placeholder');
            if (placeholder) {
                placeholder.style.display = 'block';
            }
            feedTags = [];
            renderFeedTags();
            const cancelBtn = document.getElementById('feed-cancel-edit-btn');
            if (cancelBtn) {
                cancelBtn.style.display = 'none';
            }
            await loadReadingFeed();
        } else {
            alert(data.error || '피드 저장 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error saving feed entry:', error);
        alert('피드 저장 중 오류가 발생했습니다.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = feedEditingId ? '수정 완료' : '게시하기';
        }
    }
}

async function exportFeedData(event) {
    event.preventDefault();
    
    if (STATIC_MODE) {
        alert('정적 모드에서는 Export를 실행할 수 없습니다.');
        return;
    }
    
    if (!confirm('정적 데이터를 export하여 GitHub Pages에 반영하시겠습니까?')) {
        return;
    }
    
    const button = document.getElementById('feed-export-btn');
    if (button) {
        button.disabled = true;
        button.textContent = 'Exporting...';
    }
    
    try {
        const response = await fetch(getApiUrl('api/export-static'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (data.success) {
            alert('Export가 완료되었습니다! 변경 사항을 커밋/푸시해 주세요.');
        } else {
            alert('Export 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('Error exporting feed data:', error);
        alert('Export 중 오류가 발생했습니다.');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = '📤 Export Feed Data';
        }
    }
}

function formatFeedTimestamp(timestamp) {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }
    } catch (error) {
        console.error('Error formatting timestamp:', error);
    }
    return timestamp;
}

function formatMultilineText(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    return escaped.replace(/\r?\n/g, '<br>');
}

function formatFeedCaption(text) {
    return formatMultilineText(text);
}

function formatStatValue(value, fractionDigits = 0) {
    const num = Number(value);
    if (isNaN(num)) {
        return '-';
    }
    return num.toLocaleString('ko-KR', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    });
}

function formatClientToday() {
    const options = {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    };
    const formatter = new Intl.DateTimeFormat('ko-KR', options);
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year')?.value || '0000';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const day = parts.find(p => p.type === 'day')?.value || '01';
    return `${year}년 ${month}월 ${day}일`;
}

function renderMoodTags(tags) {
    if (!tags || !tags.length) {
        return '';
    }
    const chips = tags.map(tag => `<span class="feed-card-mood">#${escapeHtml(tag)}</span>`).join(' ');
    return `<div class="feed-card-tags">${chips}</div>`;
}

function getEntryMoodTags(entry) {
    if (!entry) return [];
    if (Array.isArray(entry.mood_tags) && entry.mood_tags.length > 0) {
        return entry.mood_tags;
    }
    if (typeof entry.mood === 'string' && entry.mood.trim() !== '') {
        return entry.mood.split(/[#,\s]+/).map(tag => tag.trim()).filter(tag => tag);
    }
    return [];
}

function handleFeedTagKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        const input = event.target;
        const value = input.value.trim();
        if (value) {
            addFeedTag(value);
            input.value = '';
        }
    } else if (event.key === 'Backspace' && event.target.value === '' && feedTags.length > 0) {
        feedTags.pop();
        renderFeedTags();
    }
}

function addFeedTag(rawValue) {
    const clean = rawValue.replace(/^[#\s]+/, '').trim();
    if (!clean) return;
    if (feedTags.find(tag => tag.toLowerCase() === clean.toLowerCase())) {
        return;
    }
    feedTags.push(clean);
    renderFeedTags();
}

function removeFeedTag(index) {
    if (index < 0 || index >= feedTags.length) return;
    feedTags.splice(index, 1);
    renderFeedTags();
}

function renderFeedTags() {
    const list = document.getElementById('feed-tag-list');
    if (!list) return;
    list.innerHTML = feedTags.map((tag, index) => `
        <span class="tag-chip">#${escapeHtml(tag)} <button type="button" onclick="removeFeedTag(${index})">×</button></span>
    `).join('');
}
    document.querySelectorAll('.recommendation-book-cover').forEach((input, index) => {
        input.addEventListener('input', event => {
            updateRecommendationBookPreview(index, event.target.value);
        });
    });
