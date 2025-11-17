import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import ClientForm from '../components/ClientForm';

// TODO: Replace with actual Amplify DataStore model after backend setup
interface Client {
  id: string;
  name: string;
  akas?: string[];
  contact_name?: string;
  contact_address?: string;
  contact_phone1?: string;
  contact_email1?: string;
  contact_phone2?: string;
  contact_email2?: string;
}

const Clients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual Amplify DataStore query
      // const data = await DataStore.query(Client);
      // setClients(data);

      // Placeholder: Empty array for now
      setClients([]);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingClient(null);
    setDialogOpen(true);
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this client?')) {
      try {
        // TODO: Replace with actual Amplify DataStore delete
        // await DataStore.delete(Client, id);
        console.log('Deleting client:', id);
        loadClients();
      } catch (error) {
        console.error('Error deleting client:', error);
      }
    }
  };

  const handleSave = async (clientData: Partial<Client>) => {
    try {
      if (editingClient) {
        // TODO: Update existing client
        // await DataStore.save(Client.copyOf(editingClient, updated => {
        //   Object.assign(updated, clientData);
        // }));
        console.log('Updating client:', editingClient.id, clientData);
      } else {
        // TODO: Create new client
        // await DataStore.save(new Client(clientData));
        console.log('Creating client:', clientData);
      }
      setDialogOpen(false);
      loadClients();
    } catch (error) {
      console.error('Error saving client:', error);
    }
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Client Name', flex: 1, minWidth: 200 },
    {
      field: 'akas',
      headerName: 'AKAs',
      flex: 1,
      minWidth: 200,
      valueFormatter: (value: string[]) => value?.join(', ') || '',
    },
    { field: 'contact_name', headerName: 'Contact Name', flex: 1, minWidth: 150 },
    { field: 'contact_email1', headerName: 'Email', flex: 1, minWidth: 200 },
    { field: 'contact_phone1', headerName: 'Phone', flex: 1, minWidth: 150 },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 100,
      getActions: (params) => [
        <GridActionsCellItem
          key="edit"
          icon={<EditIcon />}
          label="Edit"
          onClick={() => handleEdit(params.row)}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<DeleteIcon />}
          label="Delete"
          onClick={() => handleDelete(params.row.id)}
        />,
      ],
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Client Management</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          Add Client
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper sx={{ height: 600, width: '100%' }}>
          <DataGrid
            rows={clients}
            columns={columns}
            pageSizeOptions={[10, 25, 50, 100]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 25 },
              },
            }}
            disableRowSelectionOnClick
          />
        </Paper>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
        <DialogContent>
          <ClientForm
            client={editingClient}
            onSave={handleSave}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default Clients;
