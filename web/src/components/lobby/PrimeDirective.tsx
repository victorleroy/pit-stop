import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import {Box, Typography} from '@/ui';
import {PRIME_DIRECTIVE, PRIME_DIRECTIVE_TITLE} from '@/components/lobby/lobbyCopy';

const Quote = () => (
  <Box component="figure" sx={{m: 0}}>
    <Typography component="blockquote" sx={{m: 0}} variant="textL">
      {PRIME_DIRECTIVE.text}
    </Typography>
    {PRIME_DIRECTIVE.attribution ? (
      <Typography color="textSecondary" component="figcaption" sx={{mt: 1}} variant="textXs">
        {PRIME_DIRECTIVE.attribution}
      </Typography>
    ) : null}
  </Box>
);

/** Folded away on a phone, where the arriving team matters more than the reading. */
export const PrimeDirective = ({isCollapsible}: {isCollapsible: boolean}) =>
  isCollapsible ? (
    <Accordion defaultExpanded disableGutters elevation={0} sx={{border: '1px solid', borderColor: 'divider', borderRadius: 2, '&::before': {display: 'none'}}}>
      <AccordionSummary
        aria-controls="prime-directive-content"
        expandIcon={<ExpandMoreIcon />}
        id="prime-directive-header"
      >
        <Typography component="h2" variant="headingS">
          {PRIME_DIRECTIVE_TITLE}
        </Typography>
      </AccordionSummary>
      <AccordionDetails id="prime-directive-content">
        <Quote />
      </AccordionDetails>
    </Accordion>
  ) : (
    <Box component="section" sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
      <Typography component="h2" variant="headingS">
        {PRIME_DIRECTIVE_TITLE}
      </Typography>
      <Quote />
    </Box>
  );
