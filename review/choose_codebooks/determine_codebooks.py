#!/usr/bin/env python3
"""
Determine applicable accessibility codebooks based on building variables.
Processes YAML variables to select the correct federal and local standards.
"""

import yaml
import sys
from pathlib import Path
from typing import Dict, List, Set, Any
from datetime import datetime


class CodebookSelector:
    def __init__(self, variables: Dict[str, Any]):
        self.vars = variables
        self.codebooks: Set[str] = set()
        self.notes: List[str] = []

    def select_codebooks(self) -> Dict[str, Any]:
        """Main decision flow to determine applicable codebooks."""

        # Step 1: Federal vs State/Local Overlay
        self._check_federal_overlay()

        # Step 2: Facility Category
        self._check_facility_category()

        # Step 3: Jurisdictional Building Code
        self._check_jurisdictional_code()

        # Step 4: Timeline Anchors
        self._check_timeline_anchors()

        # Step 5: Project Scope and Alterations
        self._check_project_scope()

        # Step 6: Building Characteristics
        self._check_building_characteristics()

        # Step 7: Historic Status
        self._check_historic_status()

        # Step 8: Public Right-of-Way
        self._check_public_row()

        # Step 9: Special State Programs
        self._check_state_programs()

        return {
            'codebooks': sorted(list(self.codebooks)),
            'notes': self.notes
        }

    def _check_federal_overlay(self):
        """Step 1: Determine federal overlay (ABA, Section 504, or ADA)."""
        ownership = self.vars.get('ownership_control', {})
        funding = self.vars.get('funding_sources', {})

        # Check for federal agency ownership
        if ownership.get('federal_agency', {}).get('value'):
            agency = ownership['federal_agency']['value']
            self.codebooks.add(f"ABA Standards ({agency})")
            self.notes.append(f"Federal facility owned/leased by {agency} - ABA Standards apply instead of ADA")
            return

        # Check for federal assistance (Section 504)
        if funding.get('federal_assistance', {}).get('value'):
            if funding.get('hud_assistance', {}).get('value'):
                # HUD may allow 2010 ADA Standards instead of UFAS
                self.codebooks.add("2010 ADA Standards (HUD Section 504)")
                self.codebooks.add("UFAS (if HUD hasn't adopted 2010 ADA)")
                self.notes.append("HUD federal assistance - Section 504 applies")
            else:
                self.codebooks.add("2010 ADA Standards (Section 504)")
                self.notes.append("Federal assistance triggers Section 504")
        else:
            # Standard ADA applies
            self.codebooks.add("2010 ADA Standards")

    def _check_facility_category(self):
        """Step 2: Check facility category and add specific requirements."""
        facility = self.vars.get('facility_category', {})

        # Title III (private)
        if facility.get('ada_title_iii', {}).get('value'):
            self.notes.append("ADA Title III applies (public accommodation/commercial facility)")

        # Title II (government)
        if facility.get('ada_title_ii', {}).get('value'):
            self.notes.append("ADA Title II applies (state/local government facility)")
            self.codebooks.add("Title II Program Access Requirements")

        # Transportation facility
        if facility.get('transportation_facility', {}).get('value'):
            self.codebooks.add("49 CFR Part 37 (DOT ADA Rules)")
            self.notes.append("Transportation facility - DOT ADA rules apply")

        # Housing
        housing = facility.get('housing_category', {})
        if housing.get('fha_multifamily', {}).get('value'):
            self.codebooks.add("Fair Housing Act Design Guidelines")
            self.codebooks.add("HUD Safe Harbors")
            self.notes.append("FHA multifamily housing requirements apply")

    def _check_jurisdictional_code(self):
        """Step 3: Determine local building code requirements."""
        code_lineage = self.vars.get('building_code_lineage', {})

        # Check for special state codes first
        special_state = code_lineage.get('special_state_codes', {}).get('value', '')

        if 'CBC' in special_state or 'California' in special_state.upper():
            self.codebooks.add("California Building Code Chapter 11B")
            self.notes.append("California CBC Chapter 11B applies")
        elif 'TAS' in special_state or 'Texas' in special_state.upper():
            self.codebooks.add("Texas Accessibility Standards (TAS)")
            self.notes.append("Texas TAS applies")
        elif 'FBC' in special_state or 'Florida' in special_state.upper():
            self.codebooks.add("Florida Building Code - Accessibility")
            self.notes.append("Florida FBC-Accessibility applies")
        else:
            # Standard IBC/A117.1
            adopted = code_lineage.get('adopted_code_editions', {}).get('value', '')
            if adopted:
                self.codebooks.add(f"IBC/IEBC ({adopted})")
                self.codebooks.add(f"ICC A117.1 ({adopted})")
            else:
                self.codebooks.add("IBC/IEBC (current adopted edition)")
                self.codebooks.add("ICC A117.1 (current adopted edition)")

        # Local amendments
        if code_lineage.get('local_amendments', {}).get('value'):
            amendments = code_lineage['local_amendments']['value']
            self.notes.append(f"Local amendments apply: {amendments}")

    def _check_timeline_anchors(self):
        """Step 4: Check timeline to determine edition applicability."""
        timeline = self.vars.get('project_timeline', {})

        # ADA 2010 Standards applicability
        ada_date = timeline.get('ada_compliance_date', {}).get('value')
        if ada_date:
            self.notes.append(f"ADA compliance date: {ada_date}")

        # DOT PROWAG for transit stops
        prowag_date = timeline.get('dot_prowag_date', {}).get('value')
        if prowag_date:
            try:
                if datetime.strptime(prowag_date, '%Y-%m-%d') >= datetime(2025, 1, 17):
                    self.codebooks.add("PROWAG (Public Right-of-Way Accessibility Guidelines)")
                    self.notes.append("PROWAG applies to transit stops (post-Jan 17, 2025)")
            except:
                pass

        # FHA first occupancy
        fha_date = timeline.get('fha_first_occupancy', {}).get('value')
        if fha_date and 'post-1991' in str(fha_date).lower():
            self.notes.append("FHA applies (first occupancy after March 13, 1991)")

    def _check_project_scope(self):
        """Step 5: Check project scope and alteration triggers."""
        timeline = self.vars.get('project_timeline', {})
        alterations = self.vars.get('alteration_triggers', {})

        scope = timeline.get('project_scope', {}).get('value', '').lower()

        if 'alteration' in scope or 'renovation' in scope or 'improvement' in scope:
            self.codebooks.add("IEBC (International Existing Building Code)")

            # Primary function area triggers
            if alterations.get('primary_function_area', {}).get('value'):
                self.notes.append("Alteration affects primary function area - path of travel upgrades required (20% disproportionality limit)")

            # Title II program access
            if alterations.get('title_ii_program_access', {}).get('value'):
                self.notes.append("Title II program access evaluation required")

            # Technical infeasibility
            if alterations.get('technical_infeasibility', {}).get('value'):
                infeasibility = alterations['technical_infeasibility']['value']
                self.notes.append(f"Technical infeasibility documented: {infeasibility}")

    def _check_building_characteristics(self):
        """Step 6: Check building characteristics for specific requirements."""
        building = self.vars.get('building_characteristics', {})

        # Elevator exemption
        elevator = building.get('elevator_exemption', {}).get('value', '')
        if 'exempt' in elevator.lower():
            self.notes.append("ADA elevator exemption may apply")
        elif 'elevator is present' in elevator.lower():
            self.notes.append("Elevator present - all floors must be accessible")

        # Occupancy classification
        occupancy = building.get('occupancy_classification', {}).get('value')
        if occupancy:
            self.notes.append(f"Occupancy Group: {occupancy}")

    def _check_historic_status(self):
        """Step 7: Check historic designation and exceptions."""
        historic = self.vars.get('historic_status', {})

        if historic.get('designation', {}).get('value'):
            self.notes.append("Historic property - 'maximum extent feasible' standard applies")

        if historic.get('historic_exceptions', {}).get('value'):
            self.notes.append("Historic exceptions may apply to certain accessibility requirements")

    def _check_public_row(self):
        """Step 8: Check public right-of-way requirements."""
        row = self.vars.get('public_right_of_way', {})

        if row.get('transit_stops', {}).get('value'):
            self.codebooks.add("PROWAG (Public Right-of-Way Accessibility Guidelines)")
            self.notes.append("Transit stops included - PROWAG applies")

        if row.get('other_prowag', {}).get('value'):
            self.codebooks.add("PROWAG Guidelines (2023)")
            self.notes.append("Other PROW facilities - PROWAG guidelines may apply")

    def _check_state_programs(self):
        """Step 9: Check special state program requirements."""
        state_programs = self.vars.get('state_specific_programs', {})

        # Texas
        if state_programs.get('texas_tas', {}).get('value'):
            self.codebooks.add("Texas Accessibility Standards (TAS)")
            self.codebooks.add("TDLR Registration Requirements")
            self.notes.append("Texas: TDLR registration and RAS review required (construction ≥ $50k)")

        # California
        if state_programs.get('california_cbc', {}).get('value'):
            self.codebooks.add("California Building Code Chapter 11B")
            self.codebooks.add("CASp Review Guidelines")
            self.notes.append("California: CBC Chapter 11B mandatory, CASp review may apply")

        # Florida
        if state_programs.get('florida_fbc', {}).get('value'):
            self.codebooks.add("Florida Building Code - Accessibility")
            self.notes.append("Florida: Statewide FBC-Accessibility edition enforced")


def main():
    """Process YAML file and determine applicable codebooks."""

    # Parse command line arguments
    if len(sys.argv) < 2:
        yaml_file = Path('/Users/will/code/service/output/vars_california_st.yaml')
        if not yaml_file.exists():
            print("Usage: python determine_codebooks.py <path_to_variables.yaml>")
            print("Or place file at: /Users/will/code/service/output/vars_california_st.yaml")
            sys.exit(1)
    else:
        yaml_file = Path(sys.argv[1])

    if not yaml_file.exists():
        print(f"Error: File not found: {yaml_file}")
        sys.exit(1)

    # Load YAML variables
    with open(yaml_file, 'r') as f:
        variables = yaml.safe_load(f)

    # Process variables through decision flow
    selector = CodebookSelector(variables)
    result = selector.select_codebooks()

    # Output results
    print("\n" + "="*60)
    print("APPLICABLE ACCESSIBILITY CODEBOOKS")
    print("="*60)

    print(f"\nProject: {variables.get('project_identity', {}).get('full_address', {}).get('value', 'Unknown')}")
    print(f"Scope: {variables.get('project_timeline', {}).get('project_scope', {}).get('value', 'Unknown')}")

    print("\n" + "-"*60)
    print("REQUIRED CODEBOOKS:")
    print("-"*60)

    for i, book in enumerate(result['codebooks'], 1):
        print(f"{i:2}. {book}")

    if result['notes']:
        print("\n" + "-"*60)
        print("COMPLIANCE NOTES:")
        print("-"*60)

        for note in result['notes']:
            print(f"• {note}")

    print("\n" + "="*60)

    # Save results to file
    output_file = yaml_file.parent / f"{yaml_file.stem}_codebooks.yaml"
    with open(output_file, 'w') as f:
        yaml.dump({
            'project_address': variables.get('project_identity', {}).get('full_address', {}).get('value'),
            'project_scope': variables.get('project_timeline', {}).get('project_scope', {}).get('value'),
            'applicable_codebooks': result['codebooks'],
            'compliance_notes': result['notes'],
            'processed_date': datetime.now().isoformat()
        }, f, default_flow_style=False, sort_keys=False)

    print(f"\nResults saved to: {output_file}")


if __name__ == "__main__":
    main()