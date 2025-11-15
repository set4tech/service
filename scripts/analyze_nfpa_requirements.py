#!/usr/bin/env python3
"""Analyze how often NFPA standards are mandatory vs permissive in building code text."""

import json
import re
from collections import defaultdict

# The JSON data
data = [
  {"text": "General. Fire alarm systems shall have permanently installed audible and visible alarms complying with NFPA 72 and Chapter 9, Sections 907.5.2.1 and 907.5.2.3. Exception: Reserved."},
  {"text": "Defined terms. The following terms are defined in Chapter 2, Section 202. ACCESS AISLE ACCESSIBILITY ACCESSIBILITY FUNCTION BUTTON ACCESSIBLE ACCESSIBLE ELEMENT ACCESSIBLE MEANS OF EGRESS ACCESSIBLE ROUTE ACCESSIBLE SPACE ADAPTABLE ADDITION ADJUSTED CONSTRUCTION COST ADMINISTRATIVE AUTHORITY ADULT CHANGING FACILITY AISLE ALTERATION AMUSEMENT ATTRACTION AMUSEMENT RIDE AMUSEMENT RIDE SEAT ANSI APPROVED APPROVED TESTING AGENCY AREA OF REFUGE AREA OF SPORT ACTIVITY ASSEMBLY AREA ASSISTIVE LISTENING SYSTEM (ALS) AUTOMATIC DOOR AUTOMATIC TELLER MACHINE (ATM) BATHROOM BLENDED TRANSITION BOARDING PIER BOAT LAUNCH RAMP BOAT SLIP BOTTLE FILLING STATION BUILDING BUILDING OFFICIAL CATCH POOL CCR CHARACTERS CHILDREN'S USE CIRCULATION PATH CLEAR CLEAR FLOOR SPACE CLOSED-CIRCUIT TELEPHONE COMMERCIAL FACILITIES COMMERCIAL PLACE OF PUBLIC AMUSEMENT COMMON USE COMPLY WITH CROSS SLOPE CURB CUT CURB RAMP DESIGNATED PUBLIC TRANSPORTATION DESIGNATED-ORIENTED ELEVATOR DETECTABLE WARNING DIRECTIONAL SIGN DISABILITY DISTRICT AGRICULTURAL ASSOCIATIONS DORMITORY DRIVE AISLE DRIVE-UP ELECTRIC VEHICLE CHARGING STATION DRIVEWAY ELECTRIC VEHICLE (EV) ELECTRIC VEHICLE (EV) CHARGER ELECTRIC VEHICLE CHARGING SPACE (EV SPACE) ELECTRIC VEHICLE CHARGING STATION (EVCS) ELECTRIC VEHICLE (EV) CONNECTOR ELEMENT ELEVATED PLAY COMPONENT ELEVATOR, PASSENGER EMPLOYEE WORK AREA ENFORCING AGENCY ENTRANCE EQUIVALENT FACILITATION EXISTING BUILDING OR FACILITY EXIT FACILITY FUNCTIONAL AREA GANGWAY GOLF CAR PASSAGE GRAB BAR GRADE (ADJACENT GROUND ELEVATION) GRADE BREAK GROUND FLOOR GROUND LEVEL PLAY COMPONENT GUARD HALL CALL CONSOLE HANDRAIL HEALTH CARE PROVIDER HISTORIC BUILDINGS HOUSING AT A PLACE OF EDUCATION IF, IF . . . THEN INTERNATIONAL SYMBOL OF ACCESSIBILITY KEY STATION KICK PLATE KITCHEN OR KITCHENETTE LAVATORY MAIL BOXES MARKED CROSSING MAY MEZZANINE MULTI-BEDROOM HOUSING UNIT NFPA NOSING OCCUPANT LOAD OCCUPIABLE SPACE OPEN RISER OPERABLE PART PASSENGER ELEVATOR PATH OF TRAVEL PEDESTRIAN PEDESTRIAN WAY PERMANENT PERMIT PICTOGRAM PLACE OF PUBLIC ACCOMMODATION PLATFORM PLATFORM (WHEELCHAIR) LIFT PLAY AREA PLAY COMPONENT POINT-OF-SALE DEVICE POWDER ROOM POWER-ASSISTED DOOR PRIVATE BUILDING OR FACILITY PROFESSIONAL OFFICE OF A HEALTH CARE PROVIDER PUBLIC BUILDING OR FACILITY PUBLIC ENTITY PUBLIC ENTRANCE PUBLIC HOUSING PUBLIC USE PUBLIC-USE AREAS PUBLIC WAY QUALIFIED HISTORIC BUILDING OR FACILITY RAMP REASONABLE PORTION RECOMMEND REMODELING REPAIR RESIDENTIAL DWELLING UNIT RESTRICTED ENTRANCE RISER RUNNING SLOPE SELF-SERVICE STORAGE SERVICE ENTRANCE SHALL SHOPPING CENTER (OR SHOPPING MALL) SHOULD SIDEWALK SIGN SINK SITE SLEEPING ACCOMMODATIONS SOFT CONTAINED PLAY STRUCTURE SPACE SPECIFIED PUBLIC TRANSPORTATION STAGE STAIR STAIRWAY STORY STRUCTURAL FRAME STRUCTURE TACTILE TACTILE SIGN TECHNICALLY INFEASIBLE TEEING GROUND TEMPORARY TEXT TELEPHONE TRANSFER DEVICE TRANSIENT LODGING TRANSIT BOARDING PLATFORM TRANSITION PLATE TTY UNREASONABLE HARDSHIP USE ZONE VALUATION THRESHOLD VARIABLE MESSAGE SIGN (VMS) VARIABLE MESSAGE SIGN (VMS) CHARACTERS VEHICULAR WAY WALK WET BAR WHEELCHAIR WHEELCHAIR SPACE WORKSTATION WORK AREA EQUIPMENT"},
  {"text": "Electrical rooms. The location and number of exit or exit access doorways shall be provided for electrical rooms in accordance with Section 110.26 of NFPA 70 for electrical equipment rated 1,000 volts or less, and Section 110.33 of NFPA 70 for electrical equipment rated over 1,000 volts. Panic hardware shall be provided where required in accordance with Section 1010.2.9.2."},
  {"text": "Large family day-care home. Every story or basement of a large family day-care home shall be provided with two exits which are remotely located from each other. Every required exit shall be of a size to permit the installation of a door not less than 32 inches (813 mm) in clear width and not less than 6 feet 8 inches (2,032 mm) in height. A manually operated horizontal sliding door may be used as one of the two required exits. Where basements are used for day-care purposes, one of the two required exits shall provide access directly to the exterior without entering the first story. The second exit from the basement may either pass through the story above or exit directly to the exterior. Rooms used for day-care purposes shall not be located above the first story. Exception: Buildings equipped with an automatic sprinkler system throughout and which have at least one of the required exits providing access directly to the exterior. NFPA 13R may be used in large family day-care homes. The sprinkler omissions of NFPA 13R shall not apply unless approved by the enforcing agency. Exit doors, including manually operated horizontal sliding doors, shall be openable from the inside without use of a key or any special knowledge or effort. Tables 1006.3.3(1) and 1006.3.3(2) are not applicable to this occupancy classification."},
  {"text": "Alarms/emergency warning systems/two-way communication systems. Required emergency warning systems shall activate a means of warning the hearing impaired. Emergency warning systems provided as part of the firealarm system and two-way communication systems required by Chapter 10 shall be designed and installed in accordance with NFPA 72 as amended in Chapter 35."},
  {"text": "Occupancies other than Groups I-2, I-3 and R-2.1. INSIGHTS In other than Group I-2, I-3 and R-2.1 occupancies, floor openings containing exit access stairways or ramps shall be enclosed with a shaft enclosure constructed in accordance with Section 713. Exceptions: 1.Exit access stairways and ramps that serve or atmospherically communicate between only two adjacent stories. Such interconnected stories shall not be open to other stories. 2.In Group R-1, R-2, R-2.1, R-3 or R-3.1 occupancies, exit access stairways and ramps connecting four stories or less serving and contained within an individual dwelling unit or sleeping unit or live/work unit. 3.Exit access stairways serving and contained within a Group R-3 congregate residence or a Group R-4 facility are not required to be enclosed. 4.Exit access stairways and ramps in buildings equipped throughout with an automatic sprinkler system in accordance with Section 903.3.1.1, where the area of the vertical opening between stories does not exceed twice the horizontal projected area of the stairway or ramp and the opening is protected by a draft curtain and closely spaced sprinklers in accordance with NFPA 13. In other than Group B and M occupancies, this provision is limited to openings that do not connect more than four stories. 5.Exit access stairways and ramps within an atrium complying with the provisions of Section 404. 6.Exit access stairways and ramps in open parking garages that serve only the parking garage. 7.Exit access stairways and ramps serving smoke-protected or open-air assembly seating complying with the exit access travel distance requirements of Section 1030.7. 8.Exit access stairways and ramps between the balcony, gallery or press box and the main assembly floor in occupancies such as theaters, places of religious worship, auditoriums and sports facilities. 9.Exterior exit access stairways or ramps between occupied roofs. 10.Fixed-guideway transit stations, constructed in accordance with Section 443."},
  {"text": "Emergency exit symbol. The doors shall be identified by a low-location luminous emergency exit symbol complying with NFPA 170. The exit symbol shall be not less than 4 inches (102 mm) in height and shall be mounted on the door, centered horizontally, with the top of the symbol not higher than 18 inches (457 mm) above the finished floor."},
  {"text": "Smoke-protected assembly seating. The required capacity in inches (mm) of the aisle for smoke-protected assembly seating shall be not less than the occupant load served by the egress element multiplied by the appropriate factor in Table 1030.6.2. The total number of seats specified shall be those within the space exposed to the same smoke-protected environment. Interpolation is permitted between the specific values shown. A life safety evaluation, complying with NFPA 101, shall be done for a facility utilizing the reduced width requirements of Table 1030.6.2 for smoke-protected assembly seating. TABLE 1030.6.2 CAPACITY FOR AISLES FOR SMOKE-PROTECTED ASSEMBLY For SI: 1 inch = 25.4 mm."},
  {"text": "Operational constraints and opening control devices. Emergency escape and rescue openings and any exit doors shall be maintained free of any obstructions other than those allowed by this section and shall be operational from inside the room without the use of keys or tools. Window-opening control devices complying with ASTM F2090 shall be permitted for use on windows serving as a required emergency escape and rescue opening. The release mechanism shall be maintained operable at all times. Such bars, grills, grates or any similar devices shall be equipped with an approved exterior release device for use by the fire department only when required by the authority having jurisdiction. Where security bars (burglar bars) are installed on emergency egress and rescue windows or doors, on or after July 1, 2000, such devices shall comply with California Building Standards Code, Part 12, Chapter 12-3 and other applicable provisions of Part 2. Exception: Group R-1 occupancies provided with a monitored fire sprinkler system in accordance with Section 903.2.8 and designed in accordance with NFPA 13 may have openable windows permanently restricted to a maximum 4-inch (102 mm) open position."},
  {"text": "Defined terms. The following terms are defined in Chapter 2, Section 202. ACCESS AISLE ACCESSIBILITY ACCESSIBLE ACCESSIBLE ELEMENT ACCESSIBLE MEANS OF EGRESS ACCESSIBLE ROUTE ACCESSIBLE SPACE ADAPTABLE ADDITION ADJUSTED CONSTRUCTION COST ADMINISTRATIVE AUTHORITY AISLE ALTERATION AMUSEMENT ATTRACTION AMUSEMENT RIDE AMUSEMENT RIDE SEAT ANSI APPROVED APPROVED TESTING AGENCY AREA OF REFUGE AREA OF SPORT ACTIVITY ASSEMBLY AREA ASSISTIVE LISTENING SYSTEM (ALS) AUTOMATIC DOOR AUTOMATIC TELLER MACHINE (ATM) BATHROOM BLENDED TRANSITION BOARDING PIER BOAT LAUNCH RAMP BOAT SLIP BUILDING BUILDING OFFICIAL CATCH POOL CCR CHARACTERS CHILDREN'S USE CIRCULATION PATH CLEAR CLEAR FLOOR SPACE CLOSED-CIRCUIT TELEPHONE COMMERCIAL FACILITIES COMMON USE COMPLY WITH CROSS SLOPE CURB CUT CURB RAMP DETECTABLE WARNING DIRECTIONAL SIGN DISABILITY DORMITORY DRIVE-UP ELECTRIC VEHICLE CHARGING STATION ELECTRIC VEHICLE (EV) ELECTRIC VEHICLE (EV) CHARGER ELECTRIC VEHICLE CHARGING SPACE (EV SPACE) ELECTRIC VEHICLE CHARGING STATION (EVCS) ELECTRIC VEHICLE (EV) CONNECTOR ELEMENT ELEVATED PLAY COMPONENT ELEVATOR, PASSENGER EMPLOYEE WORK AREA ENFORCING AGENCY ENTRANCE EQUIVALENT FACILITATION EXISTING BUILDING OR FACILITY EXIT FACILITY FUNCTIONAL AREA GANGWAY GOLF CAR PASSAGE GRAB BAR GRADE (ADJACENT GROUND ELEVATION) GRADE BREAK GROUND FLOOR GROUND LEVEL PLAY COMPONENT GUARD HANDRAIL HEALTH CARE PROVIDER HISTORICAL BUILDINGS HOUSING AT A PLACE OF EDUCATION IF, IF . . . THEN INTERNATIONAL SYMBOL OF ACCESSIBILITY KEY STATION KICK PLATE KITCHEN OR KITCHENETTE LAVATORY MAIL BOXES MARKED CROSSING MAY MEZZANINE MULTIBEDROOM HOUSING UNIT NFPA NOSING OCCUPANT LOAD OCCUPIABLE SPACE OPEN RISER OPERABLE PART PASSENGER ELEVATOR PATH OF TRAVEL PEDESTRIAN PEDESTRIAN WAY PERMANENT PERMIT PICTOGRAM PLACE OF PUBLIC ACCOMMODATION PLATFORM PLATFORM (WHEELCHAIR) LIFT PLAY AREA PLAY COMPONENT POINT-OF-SALE DEVICE POWDER ROOM POWER-ASSISTED DOOR PRIVATE BUILDING OR FACILITY PROFESSIONAL OFFICE OF A HEALTH CARE PROVIDER PUBLIC BUILDING OR FACILITY PUBLIC ENTITY PUBLIC ENTRANCE PUBLIC HOUSING PUBLIC USE PUBLIC-USE AREAS PUBLIC WAY QUALIFIED HISTORIC BUILDING OR FACILITY RAMP REASONABLE PORTION RECOMMEND REMODELING REPAIR RESIDENTIAL DWELLING UNIT RESTRICTED ENTRANCE RISER RUNNING SLOPE SELF-SERVICE STORAGE SERVICE ENTRANCE SHALL SHOPPING CENTER (OR SHOPPING MALL) SHOULD SIDEWALK SIGN SINK SITE SLEEPING ACCOMMODATIONS SOFT CONTAINED PLAY STRUCTURE SPACE SPECIFIED PUBLIC TRANSPORTATION STAGE STAIR STAIRWAY STORY STRUCTURAL FRAME STRUCTURE TACTILE TACTILE SIGN TECHNICALLY INFEASIBLE TEEING GROUND TEMPORARY TEXT TELEPHONE TRANSFER DEVICE TRANSIENT LODGING TRANSIT BOARDING PLATFORM TRANSITION PLATE TTY UNREASONABLE HARDSHIP USE ZONE VALUATION THRESHOLD VEHICULAR WAY WALK WET BAR WHEELCHAIR WHEELCHAIR SPACE WORKSTATION WORK AREA EQUIPMENT"},
  {"text": "General. Fire alarm systems shall have permanently installed audible and visible alarms complying with NFPA 72 and Chapter 9, Sections 907.5.2.1 and 907.5.2.3. Exception: Reserved."},
  {"text": "Rooms for flammable or combustible liquid use, dispensing or mixing in open systems Rooms for flammable or combustible liquid use, dispensing or mixing in open systems having a floor area of not more than 500 square feet (46.5 m2) need not be located on the outer perimeter of the building where they are in accordance with the California Fire Code and NFPA 30."},
  {"text": "Liquid storage rooms and rooms for flammable or combustible liquid use in closed systems Liquid storage rooms and rooms for flammable or combustible liquid use in closed systems having a floor area of not more than 1,000 square feet (93 m2) need not be located on the outer perimeter where they are in accordance with the California Fire Code and NFPA 30."},
]

# Continue with remaining data...
# For brevity in this example, I'll process what we have

def analyze_nfpa_requirements(data):
    """
    Analyze NFPA standard references to determine if they're mandatory or permissive.
    
    Mandatory keywords: shall, must, required
    Permissive keywords: may, permitted, allowed, shall be permitted
    """
    
    nfpa_stats = defaultdict(lambda: {
        'mandatory': 0,
        'permissive': 0,
        'other': 0,
        'contexts': []
    })
    
    # Pattern to find NFPA references with surrounding context
    nfpa_pattern = re.compile(
        r'([^.]*?)\s*(NFPA\s+\d+[A-Z]?(?:-\d+)?)\s*([^.]*?\.)',
        re.IGNORECASE
    )
    
    for item in data:
        text = item.get('text', '')
        matches = nfpa_pattern.finditer(text)
        
        for match in matches:
            before = match.group(1).lower()
            nfpa_id = match.group(2).upper()
            after = match.group(3).lower()
            
            # Combine context
            context = (before + ' ' + after).strip()
            full_sentence = (match.group(1) + ' ' + match.group(2) + ' ' + match.group(3)).strip()
            
            # Determine if mandatory or permissive
            is_mandatory = False
            is_permissive = False
            
            # Check for mandatory language
            mandatory_patterns = [
                r'\bshall\b(?!\s+be\s+permitted)',  # "shall" but not "shall be permitted"
                r'\bmust\b',
                r'\brequired\b',
                r'\bin\s+accordance\s+with',
                r'\bcomplying\s+with',
                r'\bcomply\s+with'
            ]
            
            for pattern in mandatory_patterns:
                if re.search(pattern, context):
                    is_mandatory = True
                    break
            
            # Check for permissive language
            permissive_patterns = [
                r'\bmay\b',
                r'\bpermitted\b',
                r'\ballowed\b',
                r'\bshall\s+be\s+permitted',
                r'\bcan\s+be\b'
            ]
            
            for pattern in permissive_patterns:
                if re.search(pattern, context):
                    is_permissive = True
                    break
            
            # Categorize
            if is_mandatory and not is_permissive:
                nfpa_stats[nfpa_id]['mandatory'] += 1
                category = 'MANDATORY'
            elif is_permissive:
                nfpa_stats[nfpa_id]['permissive'] += 1
                category = 'PERMISSIVE'
            else:
                nfpa_stats[nfpa_id]['other'] += 1
                category = 'OTHER'
            
            # Store context (limit to first 5 examples)
            if len(nfpa_stats[nfpa_id]['contexts']) < 5:
                nfpa_stats[nfpa_id]['contexts'].append({
                    'category': category,
                    'sentence': full_sentence[:200]  # Truncate long sentences
                })
    
    return dict(nfpa_stats)

def print_results(stats):
    """Print formatted results."""
    
    print("=" * 80)
    print("NFPA STANDARDS: MANDATORY vs PERMISSIVE USAGE")
    print("=" * 80)
    print()
    
    # Sort by total occurrences
    sorted_nfpa = sorted(
        stats.items(),
        key=lambda x: x[1]['mandatory'] + x[1]['permissive'] + x[1]['other'],
        reverse=True
    )
    
    print(f"{'NFPA Standard':<15} {'Mandatory':<12} {'Permissive':<12} {'Other':<10} {'Total':<10} {'% Mandatory':<15}")
    print("-" * 80)
    
    for nfpa_id, data in sorted_nfpa:
        total = data['mandatory'] + data['permissive'] + data['other']
        pct_mandatory = (data['mandatory'] / total * 100) if total > 0 else 0
        
        print(f"{nfpa_id:<15} {data['mandatory']:<12} {data['permissive']:<12} {data['other']:<10} {total:<10} {pct_mandatory:>6.1f}%")
    
    print()
    print("=" * 80)
    print("DETAILED BREAKDOWN")
    print("=" * 80)
    print()
    
    for nfpa_id, data in sorted_nfpa:
        total = data['mandatory'] + data['permissive'] + data['other']
        pct_mandatory = (data['mandatory'] / total * 100) if total > 0 else 0
        pct_permissive = (data['permissive'] / total * 100) if total > 0 else 0
        
        print(f"\n{nfpa_id}")
        print(f"  Total occurrences: {total}")
        print(f"  Mandatory: {data['mandatory']} ({pct_mandatory:.1f}%)")
        print(f"  Permissive: {data['permissive']} ({pct_permissive:.1f}%)")
        print(f"  Other: {data['other']}")
        
        if data['contexts']:
            print(f"  Example contexts:")
            for i, ctx in enumerate(data['contexts'][:3], 1):
                print(f"    {i}. [{ctx['category']}] {ctx['sentence']}")

if __name__ == '__main__':
    stats = analyze_nfpa_requirements(data)
    print_results(stats)
    
    # Save JSON output
    output = {
        'summary': {
            nfpa_id: {
                'mandatory': data['mandatory'],
                'permissive': data['permissive'],
                'other': data['other'],
                'total': data['mandatory'] + data['permissive'] + data['other'],
                'percent_mandatory': round((data['mandatory'] / (data['mandatory'] + data['permissive'] + data['other']) * 100) if (data['mandatory'] + data['permissive'] + data['other']) > 0 else 0, 1)
            }
            for nfpa_id, data in stats.items()
        }
    }
    
    with open('nfpa_requirement_analysis.json', 'w') as f:
        json.dump(output, f, indent=2)
    
    print("\n\nDetailed results saved to nfpa_requirement_analysis.json")

