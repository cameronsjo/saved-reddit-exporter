import { setIcon } from 'obsidian';

/**
 * Creates a collapsible accordion section in a settings container.
 *
 * Returns the content container — append Setting items to it.
 * Expand/collapse state is tracked in the provided Set, so it
 * persists across tab switches (re-renders of display()).
 */
export function createCollapsibleSection(
  containerEl: HTMLElement,
  expandedSections: Set<string>,
  id: string,
  title: string,
  defaultExpanded = false,
): HTMLElement {
  // Seed default state on first render
  if (!expandedSections.has(`__init_${id}`)) {
    expandedSections.add(`__init_${id}`);
    if (defaultExpanded) {
      expandedSections.add(id);
    }
  }

  const isExpanded = expandedSections.has(id);

  // Header row — clickable + keyboard-accessible
  const header = containerEl.createDiv({
    cls: `sre-section-header${isExpanded ? ' is-expanded' : ''}`,
  });
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', String(isExpanded));

  const chevron = header.createSpan({ cls: 'sre-section-chevron' });
  setIcon(chevron, 'chevron-right');

  header.createSpan({ text: title, cls: 'sre-section-title' });

  // Content container — hidden when collapsed
  const content = containerEl.createDiv({
    cls: `sre-section-content${isExpanded ? ' is-expanded' : ''}`,
  });

  function toggleSection(): void {
    const expanding = !expandedSections.has(id);
    if (expanding) {
      expandedSections.add(id);
    } else {
      expandedSections.delete(id);
    }
    header.toggleClass('is-expanded', expanding);
    content.toggleClass('is-expanded', expanding);
    header.setAttribute('aria-expanded', String(expanding));
  }

  header.addEventListener('click', toggleSection);
  header.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleSection();
    }
  });

  return content;
}
