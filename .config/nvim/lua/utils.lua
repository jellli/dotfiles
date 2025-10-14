local M = {}
local hlg_cache = {}
local user_scope = "j/"

--- Create an augroup
--- @param name string
--- @return integer
function M.creat_group(name)
  return vim.api.nvim_create_augroup(user_scope .. name, { clear = true })
end

function M.merge(table1, table2)
  return vim.tbl_extend("force", table1, table2)
end

--- Gets the hex color of the highlight group
---@param name string
---@param option string
---@return string | nil
function M.get_hl_hex(name, option)
  if type(name) ~= "string" or (option ~= "fg" and option ~= "bg") then
    error("Invalid arguments. Usage: highlight(name: string, option: 'fg' | 'bg')")
  end
  local hl = vim.api.nvim_get_hl(0, { name = name })
  local color = hl[option]
  if not color then
    print("No " .. option .. " color found for highlight group: " .. name)
    return nil
  end
  local hex_color = string.format("#%06x", color)
  return hex_color
end

--- Get or create a highlight group
---@param name string name of the highlight group
---@param opts vim.api.keyset.highlight|nil
---@return string name with scope
function M.get_or_create_hlg(name, opts)
  local hl_name = user_scope .. name
  local o = opts or {}
  if not hlg_cache[hl_name] then
    vim.api.nvim_set_hl(0, hl_name, o)
    hlg_cache[hl_name] = true
  end
  return hl_name
end

--- Maps a key to an action, mode is optional
---@param key string
---@param action string | function
---@param opts vim.keymap.set.Opts | nil
---@param mode string | string[] | nil
function M.map(key, action, opts, mode)
  local m = mode or "n"
  local o = opts or { noremap = true, silent = true }
  vim.keymap.set(m, key, action, o)
end

function M.check_file_in_cwd(filename)
  local cwd = vim.fn.getcwd()
  local filepath = cwd .. "/" .. filename
  return vim.fn.filereadable(filepath) == 1
end

return M
