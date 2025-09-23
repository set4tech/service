# set 4 service - e2e plan review 
✍️🏗️

This is the place where we will manage all notebooks, files, for executing a code review for 255 California Street. In doing this we will learn about executing a full accessibility code review and then understand how we can build systems which automate it.

## Setup

Get an aws account.

```
aws sso login
```

Install requirements

```
pip install -r requirements.txt
```

## Data

The SAAIA drawing is found here:
https://set4-data.s3.us-east-1.amazonaws.com/drawings/SAAIA/2024_0925_636386+-++255+California+St_5TH+FLOOR_IFC+set+Delta+2.pdf

To make some of the code run, it could be helpful to keep the pdf in `/data` in this repo. It is gitignored.