# Contributing to NYC OATH Summons Tracker

This document outlines the guidelines for contributing to the NYC OATH Summons Tracker project.

## Getting Started

1. **Clone the repository** and install dependencies:
   ```bash
   git clone <repository-url>
   cd OATH-Summons-Tracker
   npm install
   ```

2. **Review the documentation**:
   - `README.md` - Setup and deployment instructions
   - `TRD.md` - Technical Requirements Document (complete specifications)
   - `CLAUDE.md` - AI assistant context and coding guidelines

3. **Set up the development environment** following the README.md instructions.

## Development Workflow

### Branch Strategy

- `main` - Production-ready code
- Feature branches - Branch off `main` for new work

### Git Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the coding standards below.

3. Commit using **conventional commit** messages:
   ```
   feat(clients): add contact fields to client form
   fix(sweep): handle null respondent names
   chore(deps): upgrade MUI to v5.14
   refactor(dashboard): simplify filtering logic
   docs(readme): update deployment instructions
   test(sweep): add client matching tests
   ```

4. Push and create a Pull Request to `main`.

5. Reference TRD functional requirements in your PR (e.g., "Implements FR-03").

## Coding Standards

### Frontend (React/TypeScript)

- Use **functional components** with hooks
- Use **Material UI (MUI)** components exclusively
- Use **React Context API** for global state (no Redux/Zustand/MobX)
- Use `useState` for local component state
- Use `async/await` for all asynchronous operations
- Use TypeScript strict mode - fix all type errors

### Backend (Lambda Functions)

- Wrap all logic in `try/catch` blocks
- Use `console.error()` for error logging (goes to CloudWatch)
- Return structured JSON error responses
- Use `async/await` for all I/O operations
- Add inline comments for complex business logic

### Code Comments

Comments are **required** for:
- Client-matching logic in `dailySweep`
- HTML scraping selectors in `dataExtractor`
- Any regex or string manipulation
- Complex business logic

### Input Validation

- Use MUI's built-in validation for all forms
- Required fields must use the `required` prop
- Email fields must use `type='email'`

## Testing Requirements

### Lambda Functions

- Unit tests required for business logic
- Mock all external API calls
- Test client-matching logic (`dailySweep`)
- Test HTML parsing (`dataExtractor`)
- Use Jest or Vitest

### Running Tests

```bash
# Frontend tests
npm test

# Lambda function tests
cd amplify/backend/function/dailySweep/src
npm test

cd amplify/backend/function/dataExtractor/src
npm test
```

## Pull Request Checklist

Before submitting a PR, verify:

- [ ] Code follows the coding standards above
- [ ] All tests pass
- [ ] No TypeScript errors (`npm run build` succeeds)
- [ ] No lint errors (`npm run lint`)
- [ ] Commit messages follow conventional commit format
- [ ] PR description references relevant FR-## requirements
- [ ] Security considerations addressed (no exposed API keys, proper auth)

## Constraints (Do NOT Do)

These features are explicitly out of scope:

- File upload system
- Invoicing/billing features
- Automated calendar integration
- Automated email/reminder system
- Using Supabase or Firebase (must use AWS Amplify)
- Using OpenAI or Claude for OCR (must use Google Gemini)
- Using headless browser for scraping (must use cheerio)
- Frontend-heavy processing (use Lambda for sweep/extraction)

## Security Guidelines

- Never commit `.env` files or API keys
- All database operations must use `@auth(rules: [{ allow: owner }])`
- Validate all user inputs
- Use environment variables for secrets (configured in AWS Console)

## Questions?

- Review the `TRD.md` for complete technical specifications
- Check `CLAUDE.md` for AI assistant context
- Consult AWS Amplify documentation: https://docs.amplify.aws/
