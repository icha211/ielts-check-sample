/**
 * card-calendar.js
 * Handles month & year range selection state and view toggling.
 */

class CardCalendar {
  constructor(options = {}) {
    // Data configuration
    this.months = options.months || [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // State management
    this.currentView = 'MONTH'; // 'MONTH' or 'YEAR_RANGE'
    this.selectedYear = Number.isInteger(options.defaultYear) ? options.defaultYear : new Date().getFullYear();
    this.selectedMonthIndex = Number.isInteger(options.defaultMonth) ? options.defaultMonth : new Date().getMonth();
    this.startYearRange = options.startYearRange || 2018; // 12-year window (2018–2029)

    // DOM Element References
    this.widgetBtn = document.getElementById(options.widgetBtnId || 'month-widget-btn');
    this.calendarPicker = document.getElementById(options.calendarPickerId || 'calendar-picker');
    this.viewToggleBtn = document.getElementById(options.viewToggleBtnId || 'view-toggle-btn');
    this.headerLabel = document.getElementById(options.headerLabelId || 'header-label');
    this.toggleChevron = document.getElementById(options.toggleChevronId || 'toggle-chevron');
    this.prevBtn = document.getElementById(options.prevBtnId || 'prev-btn');
    this.nextBtn = document.getElementById(options.nextBtnId || 'next-btn');
    this.gridContainer = document.getElementById(options.gridContainerId || 'grid-container');
    this.selectedFilterText = document.getElementById(options.selectedFilterTextId || 'selected-filter-text');

    this.init();
  }

  init() {
    if (!this.widgetBtn || !this.calendarPicker) return;

    // Open/close popover on widget button click
    this.widgetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = this.calendarPicker.classList.contains('hidden');
      
      if (isHidden) {
        this.currentView = 'MONTH';
        this.renderView();
        this.setOpen(true);
      } else {
        this.setOpen(false);
      }
    });

    // Toggle between month grid and year range grid
    if (this.viewToggleBtn) {
      this.viewToggleBtn.addEventListener('click', () => {
        this.currentView = (this.currentView === 'MONTH') ? 'YEAR_RANGE' : 'MONTH';
        this.renderView();
      });
    }

    // Previous navigation (year - 1 OR range - 12)
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => {
        if (this.currentView === 'MONTH') {
          this.selectedYear--;
        } else {
          this.startYearRange -= 12;
        }
        this.renderView();
      });
    }

    // Next navigation (year + 1 OR range + 12)
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => {
        if (this.currentView === 'MONTH') {
          this.selectedYear++;
        } else {
          this.startYearRange += 12;
        }
        this.renderView();
      });
    }

    // Keep clicks inside the popover from reaching the outside-click handler
    // (re-rendered grid items are detached from the DOM before it runs)
    this.calendarPicker.addEventListener('click', (e) => e.stopPropagation());

    // Close calendar popover when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.calendarPicker.contains(e.target) && !this.widgetBtn.contains(e.target)) {
        this.setOpen(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.calendarPicker.classList.contains('hidden')) {
        this.setOpen(false);
        this.widgetBtn.focus();
      }
    });
  }

  setOpen(isOpen) {
    this.calendarPicker.classList.toggle('hidden', !isOpen);
    this.widgetBtn.setAttribute('aria-expanded', String(isOpen));
  }

  renderView() {
    if (!this.gridContainer || !this.headerLabel) return;
    this.gridContainer.innerHTML = '';

    if (this.currentView === 'MONTH') {
      // Setup Month View Header
      this.headerLabel.textContent = this.selectedYear;
      if (this.toggleChevron) {
        this.toggleChevron.style.transform = 'rotate(0deg)'; // Down cursor arrow
      }

      // Render 3x4 Month Grid
      this.months.forEach((month, index) => {
        const item = document.createElement('div');
        item.className = 'grid-item month-item';
        item.textContent = month;

        if (index === this.selectedMonthIndex) {
          item.classList.add('active');
        }

        item.addEventListener('click', () => {
          this.selectedMonthIndex = index;
          if (this.selectedFilterText) {
            this.selectedFilterText.textContent = `${month} ${this.selectedYear}`;
          }
          this.setOpen(false);
        });

        this.gridContainer.appendChild(item);
      });

    } else if (this.currentView === 'YEAR_RANGE') {
      const endYearRange = this.startYearRange + 11;

      // Setup Year Range View Header
      this.headerLabel.textContent = `${this.startYearRange} – ${endYearRange}`;
      if (this.toggleChevron) {
        this.toggleChevron.style.transform = 'rotate(180deg)'; // Up cursor arrow
      }

      // Render 3x4 Year Grid
      for (let y = this.startYearRange; y <= endYearRange; y++) {
        const item = document.createElement('div');
        item.className = 'grid-item year-item';
        item.textContent = y;

        if (y === this.selectedYear) {
          item.classList.add('active');
        }

        item.addEventListener('click', () => {
          this.selectedYear = y;
          this.currentView = 'MONTH'; // Switch back to month selection
          this.renderView();
        });

        this.gridContainer.appendChild(item);
      }
    }
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.cardCalendar = new CardCalendar({ startYearRange: 2018 });
});