#!/usr/bin/env python3
"""
Generate DATABASE_SCHEMA.md by introspecting the PostgreSQL database.

Usage:
    python scripts/generate_schema_docs.py

Requirements:
    pip install psycopg2-binary
"""

import os
import sys
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from collections import defaultdict

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("Error: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)


@dataclass
class Column:
    name: str
    data_type: str
    is_nullable: bool
    column_default: Optional[str]
    character_maximum_length: Optional[int]
    description: Optional[str]


@dataclass
class Constraint:
    name: str
    type: str
    definition: str
    columns: List[str]


@dataclass
class ForeignKey:
    constraint_name: str
    column_name: str
    foreign_table: str
    foreign_column: str
    on_delete: str


@dataclass
class Index:
    name: str
    columns: List[str]
    is_unique: bool
    index_type: str
    definition: str


@dataclass
class Table:
    name: str
    schema: str
    columns: List[Column]
    primary_key: List[str]
    foreign_keys: List[ForeignKey]
    constraints: List[Constraint]
    indexes: List[Index]
    description: Optional[str]


def get_connection_string() -> tuple[str, str]:
    """Get PostgreSQL connection string from environment or use production default.

    Returns:
        tuple: (connection_string, database_label)
    """
    # Try environment variables first
    if all(
        key in os.environ
        for key in ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"]
    ):
        host = os.environ["PGHOST"]
        port = os.environ["PGPORT"]
        database = os.environ["PGDATABASE"]
        user = os.environ["PGUSER"]
        password = os.environ["PGPASSWORD"]

        # Determine if it's prod or dev
        if "grosxzvvmhakkxybeuwu" in user or port == "6543":
            db_label = "Production"
        elif "prafecmdqiwgnsumlmqn" in user or port == "5432":
            db_label = "Development"
        else:
            db_label = f"Custom ({host}:{port})"

        return (
            f"postgresql://{user}:{password}@{host}:{port}/{database}?sslmode=require",
            db_label
        )

    # Default to production (source of truth)
    print("Using production database as source of truth...")
    return (
        "postgresql://postgres.grosxzvvmhakkxybeuwu:beiajs3%26%21%21jfSJAB12@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
        "Production"
    )


def get_tables(cursor) -> List[str]:
    """Get all tables in the public schema."""
    cursor.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """
    )
    return [row["table_name"] for row in cursor.fetchall()]


def get_columns(cursor, table_name: str) -> List[Column]:
    """Get all columns for a table."""
    cursor.execute(
        """
        SELECT
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            c.character_maximum_length,
            pgd.description
        FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_statio_all_tables st ON c.table_name = st.relname
        LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid
            AND pgd.objsubid = c.ordinal_position
        WHERE c.table_schema = 'public'
          AND c.table_name = %s
        ORDER BY c.ordinal_position
    """,
        (table_name,),
    )

    columns = []
    for row in cursor.fetchall():
        columns.append(
            Column(
                name=row["column_name"],
                data_type=format_data_type(row),
                is_nullable=row["is_nullable"] == "YES",
                column_default=row["column_default"],
                character_maximum_length=row["character_maximum_length"],
                description=row["description"],
            )
        )
    return columns


def format_data_type(col: Dict[str, Any]) -> str:
    """Format PostgreSQL data type for display."""
    data_type = col["data_type"].upper()

    # Handle character types
    if data_type in ("CHARACTER VARYING", "VARCHAR"):
        if col["character_maximum_length"]:
            return f"VARCHAR({col['character_maximum_length']})"
        return "VARCHAR"

    if data_type == "CHARACTER":
        if col["character_maximum_length"]:
            return f"CHAR({col['character_maximum_length']})"
        return "CHAR"

    # Map common types
    type_map = {
        "TIMESTAMP WITH TIME ZONE": "TIMESTAMPTZ",
        "TIMESTAMP WITHOUT TIME ZONE": "TIMESTAMP",
        "DOUBLE PRECISION": "DOUBLE",
        "BOOLEAN": "BOOLEAN",
        "INTEGER": "INTEGER",
        "BIGINT": "BIGINT",
        "SMALLINT": "SMALLINT",
        "NUMERIC": "NUMERIC",
        "TEXT": "TEXT",
        "UUID": "UUID",
        "JSONB": "JSONB",
        "JSON": "JSON",
        "ARRAY": "ARRAY",
    }

    return type_map.get(data_type, data_type)


def get_primary_key(cursor, table_name: str) -> List[str]:
    """Get primary key columns for a table."""
    cursor.execute(
        """
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = %s::regclass
          AND i.indisprimary
        ORDER BY a.attnum
    """,
        (table_name,),
    )
    return [row["attname"] for row in cursor.fetchall()]


def get_foreign_keys(cursor, table_name: str) -> List[ForeignKey]:
    """Get foreign key constraints for a table."""
    cursor.execute(
        """
        SELECT
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column,
            rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints rc
            ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND tc.table_name = %s
        ORDER BY tc.constraint_name
    """,
        (table_name,),
    )

    return [
        ForeignKey(
            constraint_name=row["constraint_name"],
            column_name=row["column_name"],
            foreign_table=row["foreign_table"],
            foreign_column=row["foreign_column"],
            on_delete=row["delete_rule"],
        )
        for row in cursor.fetchall()
    ]


def get_check_constraints(cursor, table_name: str) -> List[Constraint]:
    """Get check constraints for a table."""
    cursor.execute(
        """
        SELECT
            con.conname AS constraint_name,
            pg_get_constraintdef(con.oid) AS definition
        FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = connamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = %s
          AND con.contype = 'c'
        ORDER BY con.conname
    """,
        (table_name,),
    )

    return [
        Constraint(
            name=row["constraint_name"],
            type="CHECK",
            definition=row["definition"],
            columns=[],
        )
        for row in cursor.fetchall()
    ]


def get_indexes(cursor, table_name: str) -> List[Index]:
    """Get indexes for a table."""
    cursor.execute(
        """
        SELECT
            i.relname AS index_name,
            ix.indisunique AS is_unique,
            am.amname AS index_type,
            pg_get_indexdef(ix.indexrelid) AS definition,
            ARRAY(
                SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
                FROM generate_subscripts(ix.indkey, 1) as k
                ORDER BY k
            ) AS columns
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON i.relam = am.oid
        WHERE t.relname = %s
          AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND NOT ix.indisprimary
        ORDER BY i.relname
    """,
        (table_name,),
    )

    return [
        Index(
            name=row["index_name"],
            columns=row["columns"],
            is_unique=row["is_unique"],
            index_type=row["index_type"],
            definition=row["definition"],
        )
        for row in cursor.fetchall()
    ]


def get_table_description(cursor, table_name: str) -> Optional[str]:
    """Get table description/comment."""
    cursor.execute(
        """
        SELECT obj_description(%s::regclass, 'pg_class') AS description
    """,
        (table_name,),
    )
    result = cursor.fetchone()
    return result["description"] if result else None


def introspect_table(cursor, table_name: str) -> Table:
    """Get full metadata for a table."""
    print(f"  Introspecting {table_name}...")

    return Table(
        name=table_name,
        schema="public",
        columns=get_columns(cursor, table_name),
        primary_key=get_primary_key(cursor, table_name),
        foreign_keys=get_foreign_keys(cursor, table_name),
        constraints=get_check_constraints(cursor, table_name),
        indexes=get_indexes(cursor, table_name),
        description=get_table_description(cursor, table_name),
    )


def format_column_type(col: Column) -> str:
    """Format column type with constraints."""
    parts = [col.data_type]

    # Add primary key indicator
    # (Will be added separately in the table)

    # Add NOT NULL
    if not col.is_nullable:
        parts.append("NOT NULL")

    return " ".join(parts)


def format_foreign_key(fk: ForeignKey) -> str:
    """Format foreign key for display."""
    on_delete_map = {
        "CASCADE": "CASCADE delete",
        "SET NULL": "SET NULL delete",
        "RESTRICT": "RESTRICT delete",
        "NO ACTION": "",
    }
    on_delete_str = on_delete_map.get(fk.on_delete, fk.on_delete)

    result = f"FK → {fk.foreign_table}.{fk.foreign_column}"
    if on_delete_str:
        result += f" ({on_delete_str})"
    return result


def generate_table_markdown(table: Table) -> str:
    """Generate markdown documentation for a table."""
    md = f"### `{table.name}`\n\n"

    # Add description if available
    if table.description:
        md += f"{table.description}\n\n"

    # Schema table
    md += "**Schema:**\n\n"
    md += "| Column | Type | Description |\n"
    md += "| ------ | ---- | ----------- |\n"

    for col in table.columns:
        col_type = format_column_type(col)

        # Add PK indicator
        if col.name in table.primary_key:
            col_type += " PK"

        # Add FK indicator
        fk = next(
            (fk for fk in table.foreign_keys if fk.column_name == col.name), None
        )
        if fk:
            col_type += f" {format_foreign_key(fk)}"

        # Description from various sources
        description_parts = []
        if col.description:
            description_parts.append(col.description)

        if col.column_default:
            default = col.column_default
            # Clean up common defaults
            if "nextval" in default:
                default = "Auto-incrementing"
            elif default == "now()":
                default = "Current timestamp"
            description_parts.append(f"Default: {default}")

        description = "; ".join(description_parts) if description_parts else ""

        md += f"| `{col.name}` | {col_type} | {description} |\n"

    md += "\n"

    # Indexes
    if table.indexes:
        md += "**Indexes:**\n\n"
        for idx in table.indexes:
            unique_str = "UNIQUE " if idx.is_unique else ""
            cols_str = ", ".join(idx.columns) if idx.columns else ""

            # Extract any WHERE clause from definition
            where_clause = ""
            if "WHERE" in idx.definition:
                where_clause = " " + idx.definition.split("WHERE", 1)[1].strip()

            md += f"- `{idx.name}` {unique_str}on `({cols_str})`"
            if where_clause:
                md += f" WHERE {where_clause}"
            md += "\n"
        md += "\n"

    # Check constraints
    if table.constraints:
        md += "**Constraints:**\n\n"
        for constraint in table.constraints:
            md += f"- `{constraint.name}`: {constraint.definition}\n"
        md += "\n"

    md += "---\n\n"
    return md


def generate_markdown(tables: List[Table], source_db: str) -> str:
    """Generate complete DATABASE_SCHEMA.md content."""
    md = "# Building Codes Database Schema\n\n"
    md += "## Overview\n\n"
    md += "This database stores building code documents (e.g., California Building Code, ICC A117.1) and their hierarchical section structure in PostgreSQL/Supabase. It also manages compliance assessments, AI analysis runs, and screenshot evidence.\n\n"
    md += "_This file is auto-generated from the database schema. Do not edit manually._\n\n"
    md += f"_Source: **{source_db}** database_\n\n"
    md += "_Last generated: Run `python scripts/generate_schema_docs.py` to regenerate._\n\n"

    # Group tables by category
    core_tables = ["codes", "sections", "section_references"]
    element_tables = ["element_groups", "element_instances", "element_section_mappings"]
    assessment_tables = [
        "customers",
        "projects",
        "assessments",
        "checks",
        "analysis_runs",
        "screenshots",
        "screenshot_check_assignments",
    ]
    other_tables = [
        t.name
        for t in tables
        if t.name not in core_tables + element_tables + assessment_tables
    ]

    # Core tables
    md += "## Core Tables\n\n"
    for table_name in core_tables:
        table = next((t for t in tables if t.name == table_name), None)
        if table:
            md += generate_table_markdown(table)

    # Element tables
    md += "## Element Tables\n\n"
    for table_name in element_tables:
        table = next((t for t in tables if t.name == table_name), None)
        if table:
            md += generate_table_markdown(table)

    # Assessment tables
    md += "## Assessment Tables\n\n"
    for table_name in assessment_tables:
        table = next((t for t in tables if t.name == table_name), None)
        if table:
            md += generate_table_markdown(table)

    # Other tables
    if other_tables:
        md += "## Other Tables\n\n"
        for table_name in sorted(other_tables):
            table = next((t for t in tables if t.name == table_name), None)
            if table:
                md += generate_table_markdown(table)

    return md


def main():
    """Main entry point."""
    print("Connecting to database...")
    conn_string, db_label = get_connection_string()

    try:
        conn = psycopg2.connect(conn_string, cursor_factory=RealDictCursor)
        cursor = conn.cursor()

        print(f"Connected to {db_label} database")

        print("Fetching table list...")
        table_names = get_tables(cursor)
        print(f"Found {len(table_names)} tables")

        print("Introspecting tables...")
        tables = []
        for table_name in table_names:
            table = introspect_table(cursor, table_name)
            tables.append(table)

        print("Generating markdown...")
        markdown = generate_markdown(tables, db_label)

        output_path = "DATABASE_SCHEMA.md"
        with open(output_path, "w") as f:
            f.write(markdown)

        print(f"✓ Successfully generated {output_path}")
        print(f"  Total tables: {len(tables)}")
        print(f"  Total columns: {sum(len(t.columns) for t in tables)}")
        print(f"  Total indexes: {sum(len(t.indexes) for t in tables)}")

    except psycopg2.Error as e:
        print(f"Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        if "cursor" in locals():
            cursor.close()
        if "conn" in locals():
            conn.close()


if __name__ == "__main__":
    main()
