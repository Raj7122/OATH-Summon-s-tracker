# CLAUDE.md - AI Assistant Guide for OATH Summon's Tracker

## Project Overview

**OATH Summon's Tracker** is a project for tracking summons, pulls, and gacha statistics for the OATH game. This document provides AI assistants with comprehensive information about the codebase structure, development workflows, and key conventions.

## Repository Status

**Current State**: New repository - project structure to be determined based on initial requirements.

**Branch**: `claude/claude-md-mi3evgzx8kxx47cp-01DPRcGMm8KiUgKXP1LJVhFK`

## Project Purpose

This tracker aims to help OATH players:
- Track their summon/pull history
- Analyze gacha statistics
- Monitor pity counters
- Track character/item acquisitions
- Visualize pull rates and trends
- Plan resource allocation

## Recommended Project Structure

Since this is a new project, here's the recommended structure based on common use cases:

### Option 1: Web Application (React/Next.js)
```
/
├── src/
│   ├── components/        # React components
│   ├── pages/            # Page components
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API and data services
│   ├── utils/            # Utility functions
│   ├── types/            # TypeScript type definitions
│   └── styles/           # CSS/styling files
├── public/               # Static assets
├── tests/                # Test files
├── docs/                 # Documentation
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

### Option 2: Python Application (Flask/Django)
```
/
├── app/
│   ├── models/           # Database models
│   ├── views/            # Views/controllers
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   └── templates/        # HTML templates
├── static/               # Static assets
├── tests/                # Test files
├── migrations/           # Database migrations
├── requirements.txt
├── config.py
└── README.md
```

### Option 3: Mobile App (React Native)
```
/
├── src/
│   ├── components/       # React Native components
│   ├── screens/          # Screen components
│   ├── navigation/       # Navigation setup
│   ├── services/         # API services
│   ├── hooks/            # Custom hooks
│   ├── utils/            # Utilities
│   └── types/            # TypeScript types
├── assets/               # Images, fonts, etc.
├── android/              # Android specific
├── ios/                  # iOS specific
├── package.json
└── README.md
```

## Development Workflow

### Git Workflow

1. **Branch Naming Convention**:
   - Feature branches: `feature/<feature-name>`
   - Bug fixes: `bugfix/<bug-name>`
   - Hotfixes: `hotfix/<issue-name>`
   - AI assistant branches: `claude/<session-id>` (auto-generated)

2. **Commit Messages**:
   - Use conventional commits format: `type(scope): description`
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
   - Example: `feat(tracker): add summon history tracking`

3. **Pull Requests**:
   - Always create PRs for merging into main
   - Include description of changes
   - Reference related issues
   - Ensure tests pass before requesting review

### Code Quality Standards

1. **Linting**: Use ESLint (JavaScript/TypeScript) or Flake8/Black (Python)
2. **Type Safety**: Prefer TypeScript for JavaScript projects
3. **Testing**: Aim for >80% code coverage
4. **Documentation**: Comment complex logic, maintain up-to-date README

## Key Technical Decisions

### Data Storage
- **Local Storage**: For offline-first functionality and user data persistence
- **Backend API**: (If needed) For syncing data across devices
- **Database**: SQLite (local) or PostgreSQL/MongoDB (backend)

### Data Models

#### Summon/Pull Record
```typescript
interface SummonRecord {
  id: string;
  timestamp: Date;
  banner: string;
  result: string;
  rarity: number;
  pityCount: number;
  guaranteed: boolean;
  cost: number;
}
```

#### User Statistics
```typescript
interface UserStats {
  totalPulls: number;
  totalCost: number;
  rateByRarity: { [rarity: number]: number };
  pityStatus: { [banner: string]: number };
  acquisitions: string[];
}
```

## AI Assistant Guidelines

### When Adding Features

1. **Research First**: Always check existing code patterns before implementing
2. **Use Todo Lists**: Track multi-step tasks with TodoWrite tool
3. **Test Changes**: Run existing tests and add new tests for new features
4. **Follow Patterns**: Match existing code style and architecture
5. **Document**: Update relevant documentation when adding features

### File Operations

- **Read before Edit**: Always read files before editing
- **Prefer Edit over Write**: Use Edit tool for existing files
- **Avoid Unnecessary Files**: Don't create docs unless requested
- **Check Structure**: Verify parent directories exist before creating nested files

### Code Standards

#### TypeScript/JavaScript
- Use functional components with hooks (React)
- Prefer const over let
- Use async/await over Promise chains
- Type everything (TypeScript)
- Use meaningful variable names

#### Python
- Follow PEP 8 style guide
- Use type hints (Python 3.6+)
- Use list/dict comprehensions where appropriate
- Write docstrings for functions and classes

### Testing Requirements

- **Unit Tests**: For utility functions and business logic
- **Integration Tests**: For API endpoints and database operations
- **E2E Tests**: For critical user flows
- **Test Files**: Place adjacent to source files or in `tests/` directory

### Common Tasks

#### Adding a New Feature
1. Understand requirements and existing patterns
2. Create TodoWrite list for the feature
3. Implement feature following existing patterns
4. Write tests
5. Update documentation
6. Commit with conventional commit message

#### Fixing a Bug
1. Reproduce the bug
2. Write a failing test
3. Fix the bug
4. Verify test passes
5. Commit with fix message

#### Refactoring
1. Ensure tests exist and pass
2. Make incremental changes
3. Run tests after each change
4. Commit each logical change separately

## Security Considerations

- **Input Validation**: Always validate and sanitize user input
- **Data Privacy**: Never log sensitive user data
- **API Keys**: Use environment variables, never commit secrets
- **XSS Prevention**: Sanitize data before rendering
- **SQL Injection**: Use parameterized queries

## Performance Guidelines

- **Lazy Loading**: Load data on demand
- **Caching**: Cache frequently accessed data
- **Pagination**: Paginate large lists
- **Optimization**: Profile before optimizing
- **Debouncing**: Debounce search and input handlers

## Dependencies Management

### Adding Dependencies
- Check if dependency is actively maintained
- Verify security (no known vulnerabilities)
- Consider bundle size impact
- Document why dependency is needed

### Updating Dependencies
- Test thoroughly after updates
- Check breaking changes in changelogs
- Update lockfiles (package-lock.json, yarn.lock, etc.)

## Environment Setup

### Required Tools
- Git
- Node.js (v18+) / Python (3.9+)
- Package manager (npm/yarn/pip)
- Code editor (VS Code recommended)

### Environment Variables
```bash
# Development
NODE_ENV=development
API_URL=http://localhost:3000

# Production
NODE_ENV=production
API_URL=https://api.example.com
```

## Troubleshooting

### Common Issues

1. **Build Failures**: Clear cache and reinstall dependencies
2. **Test Failures**: Ensure test database is properly seeded
3. **Lint Errors**: Run auto-fix before manual fixes
4. **Type Errors**: Check TypeScript configuration

## Resources

### Documentation
- Project README: Overview and setup instructions
- API Documentation: (To be created if backend exists)
- Component Documentation: (To be created for UI components)

### External References
- [OATH Game Official Site](https://example.com) (Update with actual URL)
- [Gacha Statistics Reference](https://example.com) (Update with actual URL)

## Changelog

### 2025-11-17
- Initial CLAUDE.md creation
- Established project structure guidelines
- Defined development workflows and conventions

## Notes for AI Assistants

- This is a new repository - confirm project stack/framework with user before scaffolding
- The repository name suggests gacha/summon tracking functionality
- Always ask about specific requirements before implementing features
- Follow the user's technology preferences
- Keep code simple and maintainable
- Prioritize user experience and data accuracy

## Contact & Support

For questions or issues with this project:
- Create GitHub issues for bugs and feature requests
- Use pull requests for contributions
- Follow conventional commit format

---

*This document should be updated as the project evolves. AI assistants should reference this file when working on the codebase.*
