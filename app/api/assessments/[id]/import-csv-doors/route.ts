/**
 * POST /api/assessments/[id]/import-csv-doors
 * Import door elements from CSV file
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { parseCSV, convertToDoorsData, mapToDoorParameters } from '@/lib/csv-element-parser';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: assessmentId } = await params;
    console.log(`[import-csv-doors] Starting import for assessment ${assessmentId}`);

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`[import-csv-doors] Received file: ${file.name}, size: ${file.size} bytes`);

    // Read CSV content
    const csvContent = await file.text();

    // Parse CSV
    const doorGroups = parseCSV(csvContent);
    console.log(`[import-csv-doors] Parsed ${doorGroups.length} door groups`);

    if (doorGroups.length === 0) {
      return NextResponse.json({ error: 'No doors found in CSV (GroupID=5)' }, { status: 400 });
    }

    // Convert to door data
    const doors = convertToDoorsData(doorGroups);
    console.log(`[import-csv-doors] Converted to ${doors.length} doors`);

    // Get assessment details
    const supabase = supabaseAdmin();
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('id, project_id')
      .eq('id', assessmentId)
      .single();

    if (assessmentError || !assessment) {
      console.error('[import-csv-doors] Assessment not found:', assessmentError);
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Get the doors element group
    const { data: elementGroup, error: elementGroupError } = await supabase
      .from('element_groups')
      .select('id, name')
      .eq('slug', 'doors')
      .single();

    if (elementGroupError || !elementGroup) {
      console.error('[import-csv-doors] Doors element group not found:', elementGroupError);
      return NextResponse.json({ error: 'Doors element group not found' }, { status: 500 });
    }

    console.log(
      `[import-csv-doors] Using element group: ${elementGroup.name} (${elementGroup.id})`
    );

    // Create element instances and checks for each door
    const createdDoors = [];

    for (const door of doors) {
      // Map measurements to door parameters
      const doorParameters = mapToDoorParameters(door);

      console.log(
        `[import-csv-doors] Creating door: "${door.instanceLabel}" on page ${door.pageNumber}`
      );
      console.log(`[import-csv-doors] Measurements:`, door.measurements);

      // Check if element instance already exists
      const { data: existing } = await supabase
        .from('element_instances')
        .select('id')
        .eq('assessment_id', assessmentId)
        .eq('element_group_id', elementGroup.id)
        .eq('label', door.instanceLabel)
        .maybeSingle();

      let elementInstance;
      if (existing) {
        // Update existing
        console.log(`[import-csv-doors] Updating existing door ${existing.id}`);
        const { data: updated, error: updateError } = await supabase
          .from('element_instances')
          .update({
            parameters: doorParameters,
            bounding_box: door.boundingBox,
            page_number: door.pageNumber,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) {
          console.error(`[import-csv-doors] Error updating element instance:`, updateError);
          continue;
        }
        elementInstance = updated;
      } else {
        // Create new
        console.log(`[import-csv-doors] Creating new door`);
        const { data: created, error: createError } = await supabase
          .from('element_instances')
          .insert({
            assessment_id: assessmentId,
            element_group_id: elementGroup.id,
            label: door.instanceLabel,
            parameters: doorParameters,
            bounding_box: door.boundingBox,
            page_number: door.pageNumber,
          })
          .select()
          .single();

        if (createError) {
          console.error(`[import-csv-doors] Error creating element instance:`, createError);
          continue;
        }
        elementInstance = created;
      }

      console.log(`[import-csv-doors] Element instance ready: ${elementInstance.id}`);

      // Get sections mapped to this element group
      const { data: sectionMappings, error: mappingError } = await supabase
        .from('element_section_mappings')
        .select('section:section_id(id, key, number, title)')
        .eq('element_group_id', elementGroup.id)
        .or(`assessment_id.is.null,assessment_id.eq.${assessmentId}`)
        .not('section', 'is', null);

      if (mappingError) {
        console.error(`[import-csv-doors] Error fetching section mappings:`, mappingError);
      }

      console.log(
        `[import-csv-doors] Section mappings response:`,
        JSON.stringify(sectionMappings?.slice(0, 2))
      );

      // Flatten the result
      const sections =
        sectionMappings
          ?.map(
            m =>
              (m as any).section as {
                id: string;
                key: string;
                number: string;
                title: string;
              } | null
          )
          .filter(
            (s): s is { id: string; key: string; number: string; title: string } => s !== null
          ) || [];
      console.log(`[import-csv-doors] Found ${sections.length} sections mapped to doors`);

      // Get all existing checks for this element instance in one query
      console.log(`[import-csv-doors] Fetching existing checks...`);
      const { data: existingChecks } = await supabase
        .from('checks')
        .select('id, section_id, code_section_number, code_section_title')
        .eq('assessment_id', assessmentId)
        .eq('element_instance_id', elementInstance.id)
        .eq('element_group_id', elementGroup.id);

      const existingSectionIds = new Set(existingChecks?.map(c => c.section_id) || []);
      console.log(
        `[import-csv-doors] Found ${existingSectionIds.size} existing checks for this door`
      );

      // Update existing checks that are missing code_section_number or code_section_title
      const checksToUpdate = existingChecks?.filter(
        check => !check.code_section_number || !check.code_section_title
      );
      if (checksToUpdate && checksToUpdate.length > 0) {
        console.log(
          `[import-csv-doors] Updating ${checksToUpdate.length} existing checks with section info in parallel...`
        );

        // Update all checks in parallel
        await Promise.all(
          checksToUpdate.map(async check => {
            const section = sections.find(s => s.id === check.section_id);
            if (section) {
              return supabase
                .from('checks')
                .update({
                  code_section_number: section.number,
                  code_section_title: section.title,
                })
                .eq('id', check.id);
            }
          })
        );

        console.log(`[import-csv-doors] Updated ${checksToUpdate.length} checks`);
      }

      // Create checks for each section (skip if already exists)
      let checksCreated = 0;
      if (sections && sections.length > 0) {
        console.log(`[import-csv-doors] Filtering sections...`);
        const checksToInsert = sections
          .filter(section => !existingSectionIds.has(section.id))
          .map(section => ({
            assessment_id: assessmentId,
            element_instance_id: elementInstance.id,
            section_id: section.id,
            element_group_id: elementGroup.id,
            human_readable_title: `${door.instanceLabel} - ${section.number}`,
            code_section_number: section.number,
            code_section_title: section.title,
          }));

        console.log(
          `[import-csv-doors] Inserting ${checksToInsert.length} new checks (${existingSectionIds.size} already exist)...`
        );

        if (checksToInsert.length > 0) {
          const { error: checkError } = await supabase.from('checks').insert(checksToInsert);

          if (checkError) {
            console.error(`[import-csv-doors] Error creating checks:`, checkError);
          } else {
            checksCreated = checksToInsert.length;
            console.log(`[import-csv-doors] Successfully inserted ${checksCreated} checks`);
          }
        } else {
          console.log(`[import-csv-doors] All checks already exist, nothing to insert`);
        }
      }

      console.log(`[import-csv-doors] Created ${checksCreated} checks for ${door.instanceLabel}`);

      createdDoors.push({
        id: elementInstance.id,
        instanceLabel: door.instanceLabel,
        pageNumber: door.pageNumber,
        boundingBox: door.boundingBox,
        parameters: doorParameters,
        measurements: door.measurements,
        checksCreated: checksCreated,
      });
    }

    console.log(`[import-csv-doors] Successfully created ${createdDoors.length} doors`);

    return NextResponse.json({
      success: true,
      doorsCreated: createdDoors.length,
      doors: createdDoors,
    });
  } catch (error) {
    console.error('[import-csv-doors] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
