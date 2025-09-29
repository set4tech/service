# set 4 service - e2e plan review

✍️🏗️

This is the main service application for building code compliance assessment. It includes:

- **PDF Viewer and Annotator**: A web-based application for viewing architectural plans and drawings with annotation capabilities
- **Compliance Assessment Tools**: Systems for executing building code reviews and compliance analysis
- **Data Processing Utilities**: Python scripts and notebooks for code analysis and document processing

Through analyzing projects like 255 California Street, we develop and refine automated systems for accessibility code review and building compliance assessment.

## Setup

Get an aws account.

```
aws sso login
```

Create a venv

```
python -m venv venv
source venv/bin/activate
```

Install requirements

```
pip install -r requirements.txt
```

## Data

The SAAIA drawing is found here:
https://set4-data.s3.us-east-1.amazonaws.com/drawings/SAAIA/2024_0925_636386+-++255+California+St_5TH+FLOOR_IFC+set+Delta+2.pdf

To make some of the code run, it could be helpful to keep the pdf in `/data` in this repo. It is gitignored.

## Structure

- `/app` - Next.js application with PDF viewer and annotator interface
- `/review` - Files and notebooks for executing the code review process
- `/components` - Reusable React components
- `/lib` - Utility libraries and helpers
- `/public` - Static assets

```flowchart LR
  A[Which code/codes applies to this building?] --> B[Split codes into sections]
  B --> C[Get full context and scope of each code section]
  C --> D[Does this code section apply to a building of these parameters?]
  D --> E[If the code section is correctly scoped, what information is needed to judge if the building is compliant?]

  E -->|Information from drawings| F[What markups and subcrops are needed from the plans for me to be able to assess if the code section applies?]
  F --> G[Add relevant dimensions and markups to the plan/drawings]
  G --> I[Single screen with all relevant information on needed to answer the question: 'Is this building in violation of this code?']

  E -->|Extra metadata| H[Retrieve other building metadata; from drawings, specs, internet, request to architect]
  H --> I

  B -.-> N["for now we can start with the codes we have in the db"]
```
