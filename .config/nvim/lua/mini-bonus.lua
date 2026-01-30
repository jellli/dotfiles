local icons = require("icons")

---@diagnostic disable: deprecated

local M = {}

-- Private helper table
local H = {}
H.ns_id = vim.api.nvim_create_namespace("fff-minipick-ui")

---Set buffer content safely
---@param buf_id number
---@param lines string[]
function H.set_buflines(buf_id, lines)
  pcall(vim.api.nvim_buf_set_lines, buf_id, 0, -1, false, lines)
end

---Format path display (split filename and directory)
---@param item table
---@return string filename
---@return string dir_path
function H.format_file_display(item)
  local filename = item.name
  local dir_path = item.directory or ""

  -- If no explicit directory, try to deduce from relative_path
  if dir_path == "" and item.relative_path then
    local parent = vim.fn.fnamemodify(item.relative_path, ":h")
    if parent ~= "." and parent ~= "" then
      dir_path = parent
    end
  end

  return filename, dir_path
end

---Get icon and highlight group
---@param filename string
---@return string icon
---@return string hl_group
function H.get_icon(filename)
  local ext = vim.fn.fnamemodify(filename, ":e")
  local icon, hl = require("nvim-web-devicons").get_icon(filename, ext, { default = true })
  return icon or " ", hl
end

---Generic picker show function (core rendering logic)
---@param buf_id number
---@param items table[]
---@param query table
---@param get_suffix_fn function(item): string, table[]? -- Returns suffix text and extra highlight rules
function H.generic_picker_show(buf_id, items, query, get_suffix_fn)
  local lines = {}
  local meta_data = {} -- Store metadata for each line for subsequent highlighting

  for _, item in ipairs(items) do
    local filename, dir_path = H.format_file_display(item)
    local icon, icon_hl = H.get_icon(filename)

    -- Get specific suffix (Buffer diagnostics or FFF score)
    local suffix_str, suffix_hls = "", nil
    if get_suffix_fn then
      suffix_str, suffix_hls = get_suffix_fn(item)
    end

    -- Construct line: "ICON Name Path Suffix"
    local line = string.format("%s %s %s%s", icon, filename, dir_path, suffix_str)
    table.insert(lines, line)

    -- Calculate offsets for highlighting
    local icon_width = #icon
    local name_start = icon_width + 1 -- space
    local name_end = name_start + #filename
    local dir_start = name_end + 1 -- space
    local dir_end = dir_start + #dir_path

    table.insert(meta_data, {
      icon = icon,
      icon_hl = icon_hl,
      name = filename,
      dir = dir_path,
      -- Offsets
      name_start_byte = name_start,
      dir_end_byte = dir_end,
      suffix_hls = suffix_hls,
    })
  end

  H.set_buflines(buf_id, lines)

  -- Batch apply highlights
  local query_str = table.concat(query)

  for i, meta in ipairs(meta_data) do
    local row = i - 1

    -- 1. Highlight Icon
    if meta.icon_hl and #meta.icon > 0 then
      vim.api.nvim_buf_add_highlight(buf_id, H.ns_id, meta.icon_hl, row, 0, #meta.icon)
    end

    -- 2. Highlight Directory (Comment)
    if #meta.dir > 0 then
      -- Directory starts after the name and the following space
      vim.api.nvim_buf_add_highlight(
        buf_id,
        H.ns_id,
        "Comment",
        row,
        meta.name_start_byte + #meta.name + 1,
        meta.dir_end_byte
      )
    end

    -- 3. Highlight Search Matches (only within filename and path)
    if #query_str > 0 then
      -- Construct substring for search (avoid matching icon or suffix)
      -- Note: using simple string.find here; fuzzy match highlighting would be more complex
      local search_text = meta.name .. " " .. meta.dir
      local s_start, s_end = string.find(search_text, query_str, 1, true)
      if s_start then
        -- Convert back to whole line byte offset
        local hl_start = meta.name_start_byte + s_start - 1
        local hl_end = meta.name_start_byte + s_end
        vim.api.nvim_buf_add_highlight(buf_id, H.ns_id, "IncSearch", row, hl_start, hl_end)
      end
    end

    -- 4. Apply specific suffix highlights (Buffer diagnostics or FFF score)
    if meta.suffix_hls then
      for _, hl in ipairs(meta.suffix_hls) do
        -- hl structure: { group, pattern_in_suffix } or absolute positions
        if hl.group and hl.start_col and hl.end_col then
          -- If absolute columns provided
          vim.api.nvim_buf_add_highlight(buf_id, H.ns_id, hl.group, row, hl.start_col, hl.end_col)
        elseif hl.group and hl.pattern then
          -- Regex match (fallback)
          local line_text = lines[i]
          local s, e = string.find(line_text, hl.pattern)
          if s then
            vim.api.nvim_buf_add_highlight(buf_id, H.ns_id, hl.group, row, s - 1, e)
          end
        end
      end
    end
  end
end

-- ============================================================
-- FFF (File Picker) Section
-- ============================================================
M.fff = {}

---@param buf_id number
---@param items FFFItem[]
---@param query table
function M.fff.picker_show(buf_id, items, query)
  H.generic_picker_show(buf_id, items, query, function(item)
    -- Handle Frecency suffix
    local total_frecency = item.total_frecency_score or 0
    if total_frecency > 0 then
      local text = string.format(" %s %d", "", total_frecency)
      -- Return text and highlight rules
      return text, { { group = "Special", pattern = " %d+" } }
    end
    return "", nil
  end)
end

---@param query string[]|nil
---@return FFFItem[]
function M.fff.match(query)
  query = query or {}
  local file_picker = require("fff.file_picker")
  if not file_picker.is_initialized() then
    if not file_picker.setup() then
      vim.notify("Could not setup fff.nvim", vim.log.levels.ERROR)
      return {}
    end
  end
  -- Limit to 100 results
  return file_picker.search_files(table.concat(query), vim.fn.expand("%:."), 35, 4)
end

function M.fff.run()
  MiniPick.start({
    source = {
      name = "FFFiles",
      items = M.fff.match,
      -- Disable default match, as fff.match handles filtering
      match = function(_, _, query)
        MiniPick.set_picker_items(M.fff.match(query), { do_match = false })
      end,
      show = M.fff.picker_show,
    },
  })
end

-- ============================================================
-- Buffer Picker Section
-- ============================================================
M.buffers = {}

---Specific display logic for Buffer list
function M.buffers.picker_show(buf_id, items, query)
  H.generic_picker_show(buf_id, items, query, function(item)
    -- Construct diagnostic info string
    local parts = {}
    local hls = {}

    local severities = {
      { idx = 1, icon = icons.diagnostics.ERROR, hl = "DiagnosticError" },
      { idx = 2, icon = icons.diagnostics.WARN, hl = "DiagnosticWarn" },
      { idx = 3, icon = icons.diagnostics.INFO, hl = "DiagnosticInfo" },
      { idx = 4, icon = icons.diagnostics.HINT, hl = "DiagnosticHint" },
    }

    for _, sev in ipairs(severities) do
      local count = item.diagnostics_counts[sev.idx] or 0
      local str = string.format("%s %d", sev.icon, count)

      table.insert(parts, str)

      -- Must use pattern matching here as generic_show doesn't know the prefix length
      -- Note: Assumes icons do not contain regex special characters
      table.insert(hls, {
        group = sev.hl,
        pattern = vim.pesc(sev.icon) .. " %d+",
      })
    end

    if item.is_current_buf then
      table.insert(parts, "[current]")
      table.insert(hls, { group = "DiagnosticWarn", pattern = "%[current%]$" })
    end

    return " " .. table.concat(parts, " "), hls
  end)
end

function M.buffers.run()
  -- Use API to get Buffer list, more reliable than parsing nvim_exec
  local items = {}
  local bufs = vim.api.nvim_list_bufs()

  for _, buf_id in ipairs(bufs) do
    if vim.api.nvim_buf_is_valid(buf_id) and vim.bo[buf_id].buflisted then
      local name = vim.api.nvim_buf_get_name(buf_id)
      local diag_counts = { 0, 0, 0, 0 }

      -- Get diagnostic statistics
      local diagnostics = vim.diagnostic.get(buf_id)
      for _, d in ipairs(diagnostics) do
        if diag_counts[d.severity] then
          diag_counts[d.severity] = diag_counts[d.severity] + 1
        end
      end

      -- Construct Item
      table.insert(items, {
        name = vim.fn.fnamemodify(name, ":t"), -- Filename
        directory = vim.fn.fnamemodify(name, ":p:.:h"), -- Directory
        path = name, -- Full path
        bufnr = buf_id,
        is_current_buf = buf_id == vim.api.nvim_get_current_buf(),
        diagnostics_counts = diag_counts,
      })
    end
  end

  MiniPick.start({
    source = {
      name = "Buffers",
      items = items,
      show = M.buffers.picker_show,
    },
  })
end

-- ============================================================
-- LSP Picker Section
-- ============================================================

-- Open LSP picker for the given scope
---@param scope "declaration" | "definition" | "document_symbol" | "implementation" | "references" | "type_definition" | "workspace_symbol"
function M.lsp_picker(scope)
  local function get_symbol_query()
    return vim.fn.input("Symbol: ")
  end

  ---@param opts vim.lsp.LocationOpts.OnList
  local function on_list(opts)
    vim.fn.setqflist({}, " ", opts)
    if #opts.items == 1 then
      vim.cmd.cfirst()
    else
      -- Try to use mini.extra list picker if installed
      local has_extra, extra = pcall(require, "mini.extra")
      if has_extra then
        extra.pickers.list({ scope = "quickfix" }, { source = { name = opts.title } })
      else
        -- Fallback: Open Quickfix window
        vim.cmd.copen()
      end
    end
  end

  if scope == "references" then
    -- vim.lsp.buf.references(nil, { on_list = on_list })
    require("mini-test").get()
  elseif scope == "workspace_symbol" then
    vim.lsp.buf.workspace_symbol(get_symbol_query(), { on_list = on_list })
  else
    -- Dynamically call function, ensuring scope is safe
    if vim.lsp.buf[scope] then
      vim.lsp.buf[scope]({ on_list = on_list })
    else
      vim.notify("Unknown LSP scope: " .. scope, vim.log.levels.ERROR)
    end
  end
end

return M
