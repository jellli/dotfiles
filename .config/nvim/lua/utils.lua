local M = {}

M.hl = function(t)
	local parts = vim.tbl_map(function(item)
		if type(item) == "string" then
			return item
		else
			return string.format("%%#%s#%s%%*", item.hl, item.string)
		end
	end, t)
	return table.concat(parts, "")
end

return M
