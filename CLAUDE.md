# Claude Development Guidelines

## Project Overview

This repository contains the main **service** application - a Next.js 15.5.3 application for building code compliance assessment.

### Main Application
- **Location**: Root directory (`/`)
- **Name**: service
- **Tech Stack**:
  - Next.js 15.5.3
  - React 19
  - TypeScript 5.9
  - Tailwind CSS 4.1
  - Vercel Serverless Functions

### Important Notes
- This is the ONLY Next.js application in the repository
- All new features should be developed in this root service app
- The compliance assessment feature (see COMPLIANCE_ASSESSMENT_FEATURE_SPEC.md) will be built here

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run linting
npm run lint
```

## Project Structure

```
/                       # Root service app
├── app/               # Next.js app directory
│   ├── api/          # API routes (serverless functions)
│   └── [pages]/      # React components and pages
├── components/        # Shared React components
├── lib/              # Utility libraries and helpers
├── public/           # Static assets
└── package.json      # Main package file

# Python utilities (for data processing)
├── code_section_assembler.py
├── code_applicability_analyzer.py
└── schema.py
```

## Key Features (Planned)

1. **Compliance Assessment** - AI-powered building code compliance checking
2. **PDF Viewer** - Integrated viewer with screenshot capabilities
3. **Project Management** - Customer and project tracking
4. **AI Analysis** - Integration with Gemini and OpenAI for compliance analysis

## Environment Variables Required

See `.env.example` for required environment variables including:
- Supabase credentials
- AWS S3 configuration
- AI service API keys (OpenAI/Google)
- Neo4j database credentials