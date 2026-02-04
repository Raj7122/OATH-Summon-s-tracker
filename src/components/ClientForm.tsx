import { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Grid,
  Chip,
  Typography,
  Stack,
  Tooltip,
  IconButton,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

interface Client {
  id?: string;
  name: string;
  akas?: string[];
  contact_name?: string;
  contact_address?: string;
  contact_phone1?: string;
  contact_email1?: string;
  contact_phone2?: string;
  contact_email2?: string;
}

/**
 * Generates suggested AKAs based on common patterns that cause matching failures
 * with the NYC Open Data API. The API often splits company names unpredictably,
 * so these suggestions help users add variations that will match.
 */
function generateSuggestedAkas(clientName: string): string[] {
  if (!clientName?.trim()) return [];

  const suggestions: string[] = [];
  const name = clientName.trim();
  const words = name.split(/\s+/);

  // Business suffixes to handle - the NYC API often truncates at suffix boundaries
  const suffixPattern = /\s*(LLC|L\.L\.C\.|Inc|INC|I\.N\.C\.|Corp|CORP|Co|CO|Ltd|LTD)\.?$/i;
  const suffixMatch = name.match(suffixPattern);

  // 1. Without suffix (if name has one)
  // Matches Strategy 2 in dailySweep - suffix is auto-stripped in normalization
  if (suffixMatch) {
    const withoutSuffix = name.replace(suffixPattern, '').trim();
    suggestions.push(withoutSuffix);
  }

  // 2. Truncated suffix variant (e.g., "...CORP" → "...C")
  // CRITICAL: Matches exact lastName from API when suffix is split
  // Example: "CERCONE EXTERIOR RESTORATION CORP" → lastName: "CERCONE EXTERIOR RESTORATION C"
  if (suffixMatch) {
    const suffix = suffixMatch[1].replace(/\./g, '');
    const baseName = name.replace(suffixPattern, '').trim();
    const lastLetter = suffix.charAt(suffix.length - 1).toUpperCase();
    suggestions.push(`${baseName} ${lastLetter}`);
  }

  // 3. First word only (if 3+ words) - catches short references
  // Matches Strategy 4 fallback when only partial name comes through
  if (words.length >= 3) {
    const firstWord = words[0];
    if (firstWord.length >= 4) {
      suggestions.push(firstWord);
    }
  }

  // 4. Progressive truncation (remove last word)
  // Handles cases where API truncates the name - matches Strategy 3 partial matching
  if (words.length >= 3) {
    const withoutLast = words.slice(0, -1).join(' ');
    const normalizedWithoutLast = withoutLast.toLowerCase();
    const alreadySuggested = suggestions.some(s => s.toLowerCase() === normalizedWithoutLast);
    if (!alreadySuggested && withoutLast.length >= 5) {
      suggestions.push(withoutLast);
    }
  }

  // Filter out duplicates and exact matches with the original name
  const normalizedOriginal = name.toLowerCase();
  return [...new Set(suggestions)]
    .filter(s => s.toLowerCase() !== normalizedOriginal)
    .filter(s => s.length >= 3);
}

interface ClientFormProps {
  client: Client | null;
  onSave: (client: Partial<Client>) => void;
  onCancel: () => void;
}

const ClientForm: React.FC<ClientFormProps> = ({ client, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<Client>>({
    name: '',
    akas: [],
    contact_name: '',
    contact_address: '',
    contact_phone1: '',
    contact_email1: '',
    contact_phone2: '',
    contact_email2: '',
  });
  const [akaInput, setAkaInput] = useState('');
  const [suggestedAkas, setSuggestedAkas] = useState<string[]>([]);

  useEffect(() => {
    if (client) {
      setFormData(client);
    }
  }, [client]);

  // Generate suggested AKAs when name changes, filtering out any already in the list
  useEffect(() => {
    const suggestions = generateSuggestedAkas(formData.name || '');
    const existingAkas = (formData.akas || []).map(a => a.toLowerCase());
    const newSuggestions = suggestions.filter(
      s => !existingAkas.includes(s.toLowerCase())
    );
    setSuggestedAkas(newSuggestions);
  }, [formData.name, formData.akas]);

  const handleChange = (field: keyof Client) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [field]: e.target.value });
  };

  const handleAddAka = () => {
    if (akaInput.trim()) {
      setFormData({
        ...formData,
        akas: [...(formData.akas || []), akaInput.trim()],
      });
      setAkaInput('');
    }
  };

  const handleDeleteAka = (index: number) => {
    const newAkas = [...(formData.akas || [])];
    newAkas.splice(index, 1);
    setFormData({ ...formData, akas: newAkas });
  };

  const handleAddSuggestedAka = (aka: string) => {
    setFormData({
      ...formData,
      akas: [...(formData.akas || []), aka],
    });
    // Suggestion will automatically disappear due to useEffect filter
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ pt: 2 }}>
      <Grid container spacing={2}>
        {/* Client Name - Required */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            required
            label="Client Name"
            value={formData.name}
            onChange={handleChange('name')}
            helperText="The primary legal name of the client"
          />
        </Grid>

        {/* AKAs (Also Known As) */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              AKAs (Also Known As)
            </Typography>
            <Tooltip
              title={
                <Box sx={{ p: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Add variations of how NYC might record this client:
                  </Typography>
                  <Typography variant="body2" component="div">
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      <li>Shortened versions: "Cercone", "Cercone Exterior"</li>
                      <li>Without suffix: "Cercone Exterior Restoration" (no Corp/LLC)</li>
                      <li>Truncated names: "CERCONE EXTERIOR RESTORATION C"</li>
                      <li>Common abbreviations: "CER Corp", "C.E.R."</li>
                    </ul>
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                    The system automatically handles LLC/Inc/Corp suffixes, but truncated
                    versions of the company name should be added as AKAs.
                  </Typography>
                </Box>
              }
              placement="right"
              arrow
            >
              <IconButton size="small" sx={{ p: 0.25 }}>
                <HelpOutlineIcon fontSize="small" color="action" />
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              fullWidth
              size="small"
              label="Add an AKA"
              value={akaInput}
              onChange={(e) => setAkaInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddAka();
                }
              }}
              helperText="Add name variations NYC might use (truncated names, abbreviations, without Corp/LLC)"
            />
            <Button variant="outlined" onClick={handleAddAka}>
              Add
            </Button>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" gap={1}>
            {formData.akas?.map((aka, index) => (
              <Chip
                key={index}
                label={aka}
                onDelete={() => handleDeleteAka(index)}
              />
            ))}
          </Stack>

          {/* Suggested AKAs - displayed as clickable chips */}
          {suggestedAkas.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Suggested AKAs (click to add):
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" gap={1} sx={{ mt: 0.5 }}>
                {suggestedAkas.map((suggestion, index) => (
                  <Chip
                    key={index}
                    label={suggestion}
                    size="small"
                    variant="outlined"
                    color="primary"
                    onClick={() => handleAddSuggestedAka(suggestion)}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Grid>

        {/* Contact Information Section */}
        <Grid item xs={12}>
          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
            Contact Information
          </Typography>
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Contact Name"
            value={formData.contact_name}
            onChange={handleChange('contact_name')}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Contact Address"
            value={formData.contact_address}
            onChange={handleChange('contact_address')}
            multiline
            rows={2}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Phone 1"
            type="tel"
            value={formData.contact_phone1}
            onChange={handleChange('contact_phone1')}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Email 1"
            type="email"
            value={formData.contact_email1}
            onChange={handleChange('contact_email1')}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Phone 2"
            type="tel"
            value={formData.contact_phone2}
            onChange={handleChange('contact_phone2')}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Email 2"
            type="email"
            value={formData.contact_email2}
            onChange={handleChange('contact_email2')}
          />
        </Grid>

        {/* Form Actions */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="contained">
              Save Client
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ClientForm;
