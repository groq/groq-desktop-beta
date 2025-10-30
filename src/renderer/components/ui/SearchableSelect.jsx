import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * A searchable select component that allows filtering options by typing
 */
export function SearchableSelect({ 
  value, 
  onValueChange, 
  options = [], 
  placeholder = "Select...",
  className,
  disabled = false,
  getDisplayValue,
  getOptionLabel,
  getOptionValue
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Default accessors if not provided
  const displayValue = getDisplayValue 
    ? getDisplayValue(value)
    : (typeof options[0] === 'string' ? value : options.find(opt => opt.value === value)?.label || value);
  
  const getLabel = getOptionLabel || ((opt) => typeof opt === 'string' ? opt : opt.label);
  const getValue = getOptionValue || ((opt) => typeof opt === 'string' ? opt : opt.value);

  // Filter options based on search query
  const filteredOptions = options.filter(option => {
    const label = getLabel(option).toLowerCase();
    return label.includes(searchQuery.toLowerCase());
  });

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex];
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          const selectedValue = getValue(filteredOptions[highlightedIndex]);
          onValueChange(selectedValue);
          setIsOpen(false);
          setSearchQuery('');
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        break;
      default:
        // Allow typing to filter
        break;
    }
  };

  const handleOptionClick = (option) => {
    const selectedValue = getValue(option);
    onValueChange(selectedValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-xl border border-[#CBCDC2] bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          isOpen && "ring-2 ring-ring ring-offset-2"
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="line-clamp-1 text-foreground">{displayValue || placeholder}</span>
        <ChevronDown className={cn(
          "h-4 w-4 opacity-50 transition-transform duration-200",
          isOpen && "rotate-180"
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 bottom-full mb-1 w-full rounded-xl border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          {/* Search Input */}
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to filter..."
              className="w-full px-2 py-1.5 text-sm bg-background rounded-lg border border-input focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
            />
          </div>

          {/* Options List */}
          <div 
            ref={listRef}
            className="max-h-[300px] overflow-y-auto p-1"
            role="listbox"
          >
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No models found
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const optionValue = getValue(option);
                const optionLabel = getLabel(option);
                const isSelected = optionValue === value;
                const isHighlighted = index === highlightedIndex;

                return (
                  <div
                    key={optionValue}
                    onClick={() => handleOptionClick(option)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center rounded-lg py-1.5 pl-8 pr-2 text-sm outline-none transition-colors text-foreground",
                      isHighlighted && "bg-accent text-accent-foreground",
                      isSelected && "font-medium"
                    )}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {isSelected && (
                      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                    {optionLabel}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
