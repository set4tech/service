# Code Section Iteration Plan

## Overview
System for iterating through building code sections (subsections) to perform compliance checks against user-uploaded documents/screenshots.

## Core Concept
Use subsections (item_type = 'subsection') as the base unit of iteration. Each subsection is self-contained with its own requirements and pulls in any referenced sections for complete context.

## Data Structure

### Section Assembly
When iterating through code sections, each subsection includes:
1. **Base Subsection**: The main requirement (e.g., 11B-1002.3)
2. **Referenced Sections**: Any sections referenced via REFS relationship (e.g., 11B-304.2, 11B-304.3)
3. **Complete Context**: All paragraphs/legal text needed for compliance checking

### Example Assembly
```
Section 11B-1002.3 (Load and unload areas) →
  - Main requirement: "A turning space complying with Sections 11B-304.2 and 11B-304.3..."
  - Pulls in 11B-304.2: "Floor or ground surfaces of a turning space shall comply..."
  - Pulls in 11B-304.3: "The turning space shall be a T-shaped space within a 60 inch..."
```

## Iteration Strategy

### 1. Initialize with Subsections
```python
def get_sections_for_iteration(code_id):
    assembler = CodeSectionAssembler(...)
    code_info = get_code_info(code_id)

    # Start with subsections as base
    assembly = assembler.assemble_code_sections(
        code_info,
        use_subsections_as_base=True
    )

    # Returns ~552 subsections for CBC
    return assembly.sections
```

### 2. Section Iterator
```python
class SectionIterator:
    def __init__(self, sections):
        self.sections = sections
        self.current_index = 0

    def current(self):
        section = self.sections[self.current_index]
        # Get all references for complete context
        return {
            'main': section,
            'references': get_references_for_section(section.key)
        }

    def next(self):
        self.current_index += 1

    def previous(self):
        self.current_index -= 1

    def skip(self):
        # Mark as skipped and move to next
        self.mark_skipped(self.current_index)
        self.next()
```

## Clone Feature for Multi-Instance Checks

### Problem
Some requirements need to be checked multiple times for different instances:
- Each door needs individual compliance check
- Each window needs separate analysis
- Each stairway needs its own evaluation

### Solution
Allow "cloning" of a section check to create multiple instances:

```python
class CloneableSection:
    def __init__(self, section):
        self.section = section
        self.instances = []

    def add_instance(self, name):
        # e.g., "Main Entry Door", "Emergency Exit Door"
        self.instances.append({
            'id': generate_id(),
            'name': name,
            'screenshot': None,
            'analysis_result': None
        })

    def analyze_all_instances(self):
        results = []
        for instance in self.instances:
            result = analyze_with_llm(
                section=self.section,
                screenshot=instance['screenshot'],
                instance_name=instance['name']
            )
            results.append(result)
        return results
```

## Frontend Integration

### User Flow
1. **Load Sections**: Frontend receives all subsections for the code
2. **Navigate**: User clicks through sections one by one
3. **View Requirements**: Display main section + all referenced sections
4. **Capture Evidence**: User takes screenshot(s) of relevant plans
5. **Clone if Needed**: For multiple instances, clone and capture each
6. **Analyze**: Send to LLM with full context
7. **Record Result**: Store pass/fail/review status
8. **Continue**: Move to next section

### API Endpoints
```
GET  /api/sections/[codeId]     # Get all subsections
GET  /api/section/[key]/full    # Get section with references
POST /api/section/[key]/analyze # Analyze with LLM
```

## LLM Analysis Context

For each section check, provide LLM with:
```
MAIN REQUIREMENT:
[Section number and title]
[All paragraphs from main section]

REFERENCED REQUIREMENTS:
[For each reference:]
  - [Ref number and title]
  - [All paragraphs from reference]

CHECKING: [Instance name if applicable]
[Screenshot(s)]

TASK: Determine compliance (pass/fail/review)
```

## Key Benefits

1. **Complete Context**: Every section check has all needed references
2. **User Control**: Manual iteration allows user judgment on applicability
3. **Flexibility**: Clone feature handles variable quantities
4. **Focused Checks**: Each subsection is a discrete, manageable check
5. **No Missing Requirements**: Starting with subsections ensures nothing is skipped

## Implementation Priority

1. **Phase 1**: Basic iteration through sections
2. **Phase 2**: Reference inclusion for complete context
3. **Phase 3**: Clone feature for multi-instance
4. **Phase 4**: LLM integration with full context
5. **Phase 5**: Results tracking and reporting

## Technical Notes

- CBC has ~552 subsections to iterate through
- Each subsection may reference 0-10 other sections
- Total context per check: 1-11 sections worth of requirements
- Screenshots stored in Supabase Storage
- LLM calls include both text requirements and images