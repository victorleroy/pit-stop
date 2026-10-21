import {Typography} from '@/ui';
import Link from '@mui/material/Link';

/**
 * The AGPL asks whoever runs a modified Pit Stop to offer its source to the people using it
 * (section 13). A fork points this at its own repository.
 */
const SOURCE_URL = 'https://github.com/victorleroy/pit-stop';

export const SourceLink = () => (
  <Typography color="textSecondary" sx={{textAlign: 'center'}} variant="textXs">
    Pit Stop is free software under the AGPL.{' '}
    <Link color="inherit" href={SOURCE_URL} rel="noreferrer" target="_blank">
      Source code
    </Link>
  </Typography>
);
