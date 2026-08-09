import type { ReactNode } from "react";
import Avatar from "@mui/material/Avatar";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export type BentoFeature = {
  title: string;
  body: string;
  label: string;
  icon: ReactNode;
  visual?: ReactNode;
  wide?: boolean;
};

export default function BentoFeatureGrid({ items }: { items: BentoFeature[] }) {
  return (
    <Grid container spacing={2.5}>
      {items.map((item) => (
        <Grid key={item.title} size={{ xs: 12, md: item.wide ? 8 : 4 }}>
          <Card className={item.wide ? "bento-card bento-card-wide" : "bento-card"}>
            <CardContent>
              <Stack spacing={2.5} className="bento-card-content">
                <Stack direction="row" className="align-center" spacing={1.5}>
                  <Avatar variant="rounded" className="bento-icon">
                    {item.icon}
                  </Avatar>
                  <Chip size="small" variant="outlined" label={item.label} />
                </Stack>
                <Stack spacing={0.75}>
                  <Typography variant="h5" component="h3">
                    {item.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.body}
                  </Typography>
                </Stack>
                {item.visual ? <div className="bento-visual">{item.visual}</div> : null}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
