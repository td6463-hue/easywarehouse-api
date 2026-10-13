import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';
import https from 'https';
import http from 'http';

// Helper function to resolve redirects and extract coordinates (for Google Maps links)
async function resolveGoogleMapsLocation(inputUrl: string): Promise<{ latitude: string; longitude: string; resolvedUrl: string } | null> {
  const cleanInput = inputUrl.trim();

  // 1. Direct extraction first
  let coords = extractCoordinates(cleanInput);
  if (coords) return { ...coords, resolvedUrl: cleanInput };

  // 2. Fetch using native fetch with redirect: 'follow'
  try {
    const res = await fetch(cleanInput, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const finalUrl = res.url;
    coords = extractCoordinates(finalUrl);
    if (coords) return { ...coords, resolvedUrl: finalUrl };

    // 3. If still not in URL, inspect HTML content (meta tags / staticmap / center)
    const html = await res.text();

    const centerMatch = html.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/) || html.match(/center=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (centerMatch) {
      return { latitude: centerMatch[1], longitude: centerMatch[2], resolvedUrl: finalUrl };
    }

    const llMatch = html.match(/ll=(-?\d+\.\d+)%2C(-?\d+\.\d+)/) || html.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (llMatch) {
      return { latitude: llMatch[1], longitude: llMatch[2], resolvedUrl: finalUrl };
    }

    const allCoords = html.match(/(-?\d{1,2}\.\d{4,}),\s*(-?\d{1,3}\.\d{4,})/);
    if (allCoords) {
      return { latitude: allCoords[1], longitude: allCoords[2], resolvedUrl: finalUrl };
    }
  } catch (err: any) {
    console.error('Error resolving Google Maps URL:', err.message);
  }

  return null;
}

function extractCoordinates(urlOrText: string): { latitude: string; longitude: string } | null {
  if (!urlOrText) return null;
  const decoded = decodeURIComponent(urlOrText).replace(/\+/g, ' ');

  // 1. /search/lat,lng or /search/lat+lng
  const searchMatch = decoded.match(/\/search\/(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/);
  if (searchMatch) return { latitude: searchMatch[1], longitude: searchMatch[2] };

  // 2. /place/lat,lng
  const placeMatch = decoded.match(/\/place\/(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/);
  if (placeMatch) return { latitude: placeMatch[1], longitude: placeMatch[2] };

  // 3. @lat,lng
  const atMatch = decoded.match(/@(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/);
  if (atMatch) return { latitude: atMatch[1], longitude: atMatch[2] };

  // 4. query params: ?q=, query=, ll=, center=, saddr=, daddr=
  const qMatch = decoded.match(/[?&](?:q|query|ll|center|saddr|daddr)=(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/);
  if (qMatch) return { latitude: qMatch[1], longitude: qMatch[2] };

  // 5. !3dlat!4dlng
  const dataMatch = decoded.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (dataMatch) return { latitude: dataMatch[1], longitude: dataMatch[2] };

  // 6. Direct comma or space separated coords (e.g. "18.024641, 102.651643")
  const directMatch = decoded.match(/(-?\d{1,2}\.\d{4,})[\s,]+(-?\d{1,3}\.\d{4,})/);
  if (directMatch) return { latitude: directMatch[1], longitude: directMatch[2] };

  return null;
}

const router = Router();

// GET: List all branches
router.get('/', async (req, res) => {
  /*  #swagger.tags = ['Branches']
      #swagger.summary = 'List all branches'
      #swagger.parameters['store_id'] = {
        in: 'query',
        description: 'Filter by parent store UUID',
        type: 'string',
        required: false
      }
      #swagger.parameters['status'] = {
        in: 'query',
        description: 'Filter by status (1=Active, 0=Inactive)',
        type: 'integer',
        required: false
      }
  */
  try {
    const { store_id, status } = req.query;
    let query = `
      SELECT 
        b.*,
        s.store_name,
        s.store_code
      FROM branch b
      LEFT JOIN store s ON b.store_id = s.store_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (store_id) {
      query += ' AND b.store_id = ?';
      params.push(String(store_id).trim());
    }

    if (status !== undefined) {
      query += ' AND b.status = ?';
      params.push(Number(status));
    }

    query += ' ORDER BY b.createdate DESC';

    const [rows]: any = await pool.query(query, params);

    return res.json({
      success: true,
      total: rows.length,
      data: rows,
    });
  } catch (error: any) {
    console.error('Database query error in GET /branches:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch branches from database',
      error: error.message,
    });
  }
});

// POST: Resolve or parse Google Maps location
router.post('/resolve-location', async (req, res) => {
  /*  #swagger.tags = ['Branches']
      #swagger.summary = 'Parse or resolve Google Maps URL to extract latitude and longitude'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Google Maps link or coordinates',
        required: true,
        schema: {
          url: 'https://maps.app.goo.gl/...'
        }
      }
  */
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, message: 'Google Maps URL is required' });
    }

    const cleanInput = url.trim();

    const result = await resolveGoogleMapsLocation(cleanInput);

    if (!result) {
      return res.status(422).json({
        success: false,
        message: 'Could not extract latitude and longitude from the provided Google Maps link',
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error in POST /branches/resolve-location:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resolve location URL',
      error: error.message,
    });
  }
});

// GET: Get branch by ID
router.get('/:id', async (req, res) => {
  /*  #swagger.tags = ['Branches']
      #swagger.summary = 'Get branch by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Branch UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const branchId = req.params.id;
    const query = `
      SELECT 
        b.*,
        s.store_name,
        s.store_code
      FROM branch b
      LEFT JOIN store s ON b.store_id = s.store_id
      WHERE b.branch_id = ?
    `;
    const [rows]: any = await pool.query(query, [branchId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    console.error('Database query error in GET /branches/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch branch details',
      error: error.message,
    });
  }
});

// POST: Create branch (generates UUID: 090dcb92-f56d-4b73-bd05-d2500cd2a216)
router.post('/', async (req, res) => {
  /*  #swagger.tags = ['Branches']
      #swagger.summary = 'Create a new branch'
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Branch creation payload',
        required: true,
        schema: {
          store_id: '090dcb92-f56d-4b73-bd05-d2500cd2a216',
          branch_code: 'BR-VTN-01',
          branch_name: 'Vientiane Central Branch',
          phone: '+856 20 5511 8899',
          manager_name: 'Bounmy Sisavath',
          address: 'Dongpalane Road, Sisattanak District, Vientiane',
          status: 1
        }
      }
  */
  try {
    const {
      store_id,
      branch_code,
      branch_name,
      phone = null,
      manager_name = null,
      address = null,
      latitude = null,
      longitude = null,
      status = 1,
    } = req.body;

    if (!store_id || !branch_code || !branch_name) {
      return res.status(400).json({
        success: false,
        message: 'store_id, branch_code, and branch_name are required fields',
      });
    }

    const branch_id = uuidv4();

    const insertSql = `
      INSERT INTO branch 
        (branch_id, store_id, branch_code, branch_name, phone, manager_name, address, latitude, longitude, status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await pool.query(insertSql, [
      branch_id,
      String(store_id).trim(),
      branch_code.trim(),
      branch_name.trim(),
      phone ? String(phone).trim() : null,
      manager_name ? String(manager_name).trim() : null,
      address ? String(address).trim() : null,
      latitude ? String(latitude).trim() : null,
      longitude ? String(longitude).trim() : null,
      Number(status),
    ]);

    const [createdRows]: any = await pool.query(
      `SELECT 
        b.*,
        s.store_name,
        s.store_code
       FROM branch b
       LEFT JOIN store s ON b.store_id = s.store_id
       WHERE b.branch_id = ?`,
      [branch_id]
    );

    return res.status(201).json({
      success: true,
      message: 'Branch created successfully',
      data: createdRows[0],
    });
  } catch (error: any) {
    console.error('Database query error in POST /branches:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create branch in database',
      error: error.message,
    });
  }
});

// PUT: Update branch
router.put('/:id', async (req, res) => {
  /*  #swagger.tags = ['Branches']
      #swagger.summary = 'Update an existing branch'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Branch UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
      #swagger.parameters['body'] = {
        in: 'body',
        description: 'Branch update payload',
        required: true,
        schema: {
          store_id: '090dcb92-f56d-4b73-bd05-d2500cd2a216',
          branch_code: 'BR-VTN-01',
          branch_name: 'Vientiane Central Branch Updated',
          phone: '+856 20 5511 8899',
          manager_name: 'Bounmy Sisavath',
          address: 'Dongpalane Road, Sisattanak District, Vientiane',
          status: 1
        }
      }
  */
  try {
    const branchId = req.params.id;

    const [existingRows]: any = await pool.query(
      'SELECT * FROM branch WHERE branch_id = ?',
      [branchId]
    );

    if (!existingRows || existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    const { store_id, branch_code, branch_name, phone, manager_name, address, latitude, longitude, status } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (store_id !== undefined) {
      updates.push('store_id = ?');
      params.push(String(store_id).trim());
    }
    if (branch_code !== undefined) {
      updates.push('branch_code = ?');
      params.push(branch_code.trim());
    }
    if (branch_name !== undefined) {
      updates.push('branch_name = ?');
      params.push(branch_name.trim());
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone ? String(phone).trim() : null);
    }
    if (manager_name !== undefined) {
      updates.push('manager_name = ?');
      params.push(manager_name ? String(manager_name).trim() : null);
    }
    if (address !== undefined) {
      updates.push('address = ?');
      params.push(address ? String(address).trim() : null);
    }
    if (latitude !== undefined) {
      updates.push('latitude = ?');
      params.push(latitude ? String(latitude).trim() : null);
    }
    if (longitude !== undefined) {
      updates.push('longitude = ?');
      params.push(longitude ? String(longitude).trim() : null);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(Number(status));
    }

    if (updates.length > 0) {
      params.push(branchId);
      await pool.query(`UPDATE branch SET ${updates.join(', ')} WHERE branch_id = ?`, params);
    }

    const [updatedRows]: any = await pool.query(
      `SELECT 
        b.*,
        s.store_name,
        s.store_code
       FROM branch b
       LEFT JOIN store s ON b.store_id = s.store_id
       WHERE b.branch_id = ?`,
      [branchId]
    );

    return res.json({
      success: true,
      message: 'Branch updated successfully',
      data: updatedRows[0],
    });
  } catch (error: any) {
    console.error('Database query error in PUT /branches/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update branch',
      error: error.message,
    });
  }
});

// DELETE: Delete branch
router.delete('/:id', async (req, res) => {
  /*  #swagger.tags = ['Branches']
      #swagger.summary = 'Delete branch by ID'
      #swagger.parameters['id'] = {
        in: 'path',
        description: 'Branch UUID',
        required: true,
        type: 'string',
        example: '090dcb92-f56d-4b73-bd05-d2500cd2a216'
      }
  */
  try {
    const branchId = req.params.id;

    const [existing]: any = await pool.query(
      'SELECT * FROM branch WHERE branch_id = ?',
      [branchId]
    );

    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    await pool.query('DELETE FROM branch WHERE branch_id = ?', [branchId]);

    return res.json({
      success: true,
      message: 'Branch deleted successfully',
      data: existing[0],
    });
  } catch (error: any) {
    console.error('Database query error in DELETE /branches/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete branch',
      error: error.message,
    });
  }
});

export default router;
