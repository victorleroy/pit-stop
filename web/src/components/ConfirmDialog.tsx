import {Button, Dialog, Stack, Typography} from '@/ui';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';

export interface ConfirmRequest {
  confirmLabel?: string;
  message: string;
  onConfirm: () => void;
  title: string;
}

export const ConfirmDialog = ({
  onClose,
  request,
}: {
  onClose: () => void;
  request?: ConfirmRequest;
}) => (
  <Dialog onClose={onClose} open={Boolean(request)}>
    <DialogTitle>{request?.title}</DialogTitle>
    <DialogContent>
      <Stack spacing={1} sx={{pt: 1}}>
        <Typography variant="textM">{request?.message}</Typography>
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} variant="text">
        Cancel
      </Button>
      <Button
        color="error"
        onClick={() => {
          request?.onConfirm();
          onClose();
        }}
        variant="contained"
      >
        {request?.confirmLabel ?? 'Delete'}
      </Button>
    </DialogActions>
  </Dialog>
);
