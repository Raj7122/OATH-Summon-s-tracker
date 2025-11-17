import { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Grid,
  Chip,
  Typography,
  Stack,
} from '@mui/material';

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

  useEffect(() => {
    if (client) {
      setFormData(client);
    }
  }, [client]);

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
          <Typography variant="body2" color="text.secondary" gutterBottom>
            AKAs (Also Known As)
          </Typography>
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
              helperText="Press Enter or click Add to add an alias"
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
