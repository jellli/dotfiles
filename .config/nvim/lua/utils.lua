local M = {}
--- Create an augroup
--- @param name string
--- @return integer
function M.create_autocmd(name)
  return vim.api.nvim_create_augroup(name, { clear = true })
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

return M
