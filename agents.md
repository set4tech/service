# AI Agents Development Guide

## Project Context

This repository contains a single Next.js application called **service** located at the root directory. This is the main and only application where all development should occur.

## Application Details

- **Location**: Root directory (`/`)
- **Framework**: Next.js 15.5.3 with React 19
- **Purpose**: Building code compliance assessment platform
- **API**: Vercel Serverless Functions in `/app/api/`

## For AI Agents and Developers

### Important Guidelines

1. **Single Application**: There is only ONE Next.js app in this repository - the root service app
2. **No Other Apps**: Do not look for or reference `/viewer` or `/viewer-web` directories (they don't exist)
3. **Development Focus**: All new features should be added to the root service application
4. **Feature Specification**: See `COMPLIANCE_ASSESSMENT_FEATURE_SPEC.md` for the main feature being developed

### Quick Start

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
# The app will be available at http://localhost:3000

# Build for production
npm run build

# Run production build
npm run start
```

### File Structure

```
/                           # Root (main application directory)
├── app/                   # Next.js 15 app directory
│   ├── api/              # API routes (serverless functions)
│   │   └── [routes]/     # Individual API endpoints
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── components/            # React components
├── lib/                   # Utility functions and libraries
├── public/                # Static assets
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── next.config.js         # Next.js configuration
└── tailwind.config.ts     # Tailwind CSS configuration
```

### API Development

All API routes should be created in `/app/api/` using the Next.js 15 route handler pattern:

```typescript
// Example: app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({ message: 'Hello from API' });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Process the request
  return NextResponse.json({ success: true });
}
```

### Component Development

React components should be created in `/components/` and follow these patterns:
- Use TypeScript for type safety
- Use Tailwind CSS 4 for styling
- Components should be server components by default (Next.js 15)
- Add 'use client' directive only when client-side interactivity is needed

### Database Integration

The application integrates with:
1. **Neo4j** - For building code data (read-only)
2. **Supabase** - For application data (projects, assessments, etc.)

### AI Integration

The platform will integrate with:
- **Gemini 2.0 Flash** - For compliance analysis
- **OpenAI GPT-4** - Alternative AI provider

### Python Scripts

Supporting Python scripts for data processing:
- `code_section_assembler.py` - Fetches and assembles code sections from Neo4j
- `code_applicability_analyzer.py` - Analyzes code applicability using AI
- `schema.py` - Data structure definitions

## Development Workflow

1. Always work in the root directory
2. Use `npm run dev` for local development
3. Test API routes at `http://localhost:3000/api/*`
4. Follow the structure defined in `COMPLIANCE_ASSESSMENT_FEATURE_SPEC.md`
5. Commit changes with clear, descriptive messages

## Common Tasks

### Adding a new API endpoint
Create a new directory and route.ts file in `/app/api/`

### Adding a new page
Create a new directory and page.tsx file in `/app/`

### Adding a new component
Create a new .tsx file in `/components/`

### Working with environment variables
Update `.env.local` with required variables (see `.env.example`)

## Remember

- This is the ONLY application in the repository
- All features go into this root service app
- Follow Next.js 15 patterns and best practices
- Use TypeScript for all new code
- Reference `COMPLIANCE_ASSESSMENT_FEATURE_SPEC.md` for feature requirements