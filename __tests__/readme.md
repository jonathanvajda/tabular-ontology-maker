To set up jest:
```
npm init -y
npm install --save-dev jest
```
Example project structure

```
/project-root
  └── /src
      └── ontology-settings.js
  └── /__tests__
      └── ontology-settings.test.js
  └── package.json
  └── jest.config.js (optional)
```


🧪 1. What to Test
Here are the key functions to unit test:

| Function | Inputs | Expected Output / Side Effect |
| --- | --- | --- |
| getCurrentDateParts()|–|Object with { year, month, day }|
| toCamelCase(str)|String|CamelCased string|
|generateOntologySettings()|baseIRI, label|Settings object + localStorage.setItem('ontologySettings')|
|loadOntologySettings()|–|Parsed settings from localStorage|
|isValidOntology(content)|RDF/OWL string|true or false|

For others like handleImportFileUpload(), you’ll need DOM mocking or integration testing (e.g., using jsdom).

Run tests
```
npm test
```
